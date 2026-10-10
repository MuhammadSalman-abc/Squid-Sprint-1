import { isValidObjectId, type ReadableCollection } from "../../integrations/mongodb/index.js";
import type { OrganizationProfile, OrganizationState } from "./types.js";
import {
  buildOrganizationProfile,
  type OrganizationProfilePrincipal,
  type OrganizationWorkspaceProfile
} from "./domain/organization-profile.js";

// This repository currently owns the scoped query and is intentionally structured
// so the future shared Workspace gateway (01.4.01) can replace it later.

type OrganizationDocument = {
  _id: string;
  name: string;
  ownerId: string;
  createdAt: Date;
  status?: "ACTIVE" | "ARCHIVED" | "DELETION_SCHEDULED" | "DELETED";
  deletionScheduledFor?: Date;
  archivedAt?: Date | null;
};

type WorkspaceDocument = {
  _id: string;
  orgId: string;
  name: string;
  status: string;
  deletedAt?: Date;
};

type MembershipDocument = {
  _id: string;
  workspaceId: string;
  userId: string;
  status: "ACTIVE" | "SUSPENDED" | "REMOVED";
  deletedAt?: Date;
};

type UserDocument = {
  _id: string;
  displayName?: string;
};

export type WorkspaceRepositoryDependencies = Readonly<{
  organizations: ReadableCollection<OrganizationDocument>;
  workspaces: ReadableCollection<WorkspaceDocument>;
  memberships: ReadableCollection<MembershipDocument>;
  userById: (userId: string) => Promise<UserDocument | null>;
}>;

export type WorkspaceRepository = Readonly<{
  findOrganizationProfile: (principal: OrganizationProfilePrincipal, orgId: string) => Promise<OrganizationProfile | null>;
}>;

export const createWorkspaceRepository = ({
  organizations,
  workspaces,
  memberships,
  userById
}: WorkspaceRepositoryDependencies): WorkspaceRepository => {
  return Object.freeze({
    findOrganizationProfile: async (principal: OrganizationProfilePrincipal, orgId: string): Promise<OrganizationProfile | null> => {
      if (!isValidObjectId(orgId)) return null;
      if (!isValidObjectId(principal.userId)) return null;

      const eligibleWorkspaces = await workspaces.find({
        status: { $ne: "DELETED" },
        deletedAt: { $exists: false },
        orgId
      });

      const organization = await organizations.findOne({
        _id: orgId,
        status: { $ne: "DELETED" },
        deletedAt: null
      });

      if (!organization) return null;

      const workspaceIds = eligibleWorkspaces.map(w => w._id);
      const activeMembershipFilter = {
        workspaceId: { $in: workspaceIds },
        status: "ACTIVE",
        deletedAt: { $exists: false }
      };
      const activeMemberCountByWorkspace = new Map<string, number>();
      let activeMemberWorkspaceIds: string[] = [];
      if (workspaceIds.length > 0 && memberships.countDistinctByGroup) {
        const [counts, principalMemberships] = await Promise.all([
          memberships.countDistinctByGroup(activeMembershipFilter, "workspaceId", "userId"),
          memberships.find({ ...activeMembershipFilter, userId: principal.userId })
        ]);
        for (const { groupValue, count } of counts) activeMemberCountByWorkspace.set(groupValue, count);
        activeMemberWorkspaceIds = [...new Set(principalMemberships.map(membership => membership.workspaceId))];
      } else if (workspaceIds.length > 0) {
        const activeMemberships = await memberships.find(activeMembershipFilter);
        activeMemberWorkspaceIds = [...new Set(activeMemberships
          .filter(membership => membership.userId === principal.userId)
          .map(membership => membership.workspaceId))];
        const memberIdsByWorkspace = new Map<string, Set<string>>();
        for (const membership of activeMemberships) {
          const workspaceMembers = memberIdsByWorkspace.get(membership.workspaceId) ?? new Set<string>();
          workspaceMembers.add(membership.userId);
          memberIdsByWorkspace.set(membership.workspaceId, workspaceMembers);
        }
        for (const [workspaceId, memberIds] of memberIdsByWorkspace) activeMemberCountByWorkspace.set(workspaceId, memberIds.size);
      }

      const status = organization.status ?? (organization.archivedAt ? "ARCHIVED" : "ACTIVE");
      let state: OrganizationState;
      if (status === "ACTIVE") {
        state = { kind: "ACTIVE" };
      } else if (status === "ARCHIVED") {
        state = { kind: "ARCHIVED" };
      } else if (status === "DELETION_SCHEDULED" && organization.deletionScheduledFor) {
        state = { kind: "DELETION_SCHEDULED", effectiveOn: organization.deletionScheduledFor };
      } else {
        return null;
      }

      const workspaceProfiles: OrganizationWorkspaceProfile[] = eligibleWorkspaces.map(workspace => ({
        id: workspace._id,
        name: workspace.name,
        state: workspace.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE",
        activeMemberCount: activeMemberCountByWorkspace.get(workspace._id) ?? 0
      }));
      const profileResult = buildOrganizationProfile({
        principal,
        organization: {
          id: organization._id,
          name: organization.name,
          ownerId: organization.ownerId,
          createdAt: organization.createdAt,
          state
        },
        workspaces: workspaceProfiles,
        activeMemberWorkspaceIds
      });
      if (!profileResult.ok) return null;

      let ownerDisplayName: string | null = null;
      try {
        const owner = await userById(organization.ownerId);
        const displayName = owner?.displayName?.trim();
        ownerDisplayName = displayName ? displayName : null;
      } catch {
        // Identity availability must not prevent an authorized viewer from seeing the organization.
      }

      return {
        ...profileResult.value,
        ownerDisplayName,
        ownerUnavailable: ownerDisplayName === null,
        workspaces: profileResult.value.workspaces
      };
    }
  });
};
