import express, { type Express } from "express";
import { createHttpLogger, type Logger } from "@workspace/logging";
import type { ApiConfig } from "../types/index.js";
import { apiRuntime } from "../constants/index.js";
import { createUserProfileRoutes, createUserSessionsRoutes, createUserInvitationRoutes, type UserProfileRouteDependencies, type UserSessionsRouteDependencies, type UserInvitationRouteDependencies } from "../features/identity/index.js";
import { createOidcSignInRoutes, type OidcSignInControllerDependencies } from "../features/authentication/index.js";
import { createHealthRoutes } from "../features/health/index.js";
import { createAuthRoutes, createAuthService, readBearerToken, type AuthService } from "../features/auth/index.js";
import {
  createOrganizationRoutes,
  createWorkspaceRoutes,
  createWorkspaceRepository,
  type MembersService,
  type OrganizationGateway,
  type OrganizationLifecycleService,
  type OrganizationSettingsReader,
  type OrganizationSettingsUpdater,
  type PrincipalResolver
} from "../features/workspace/index.js";
import { createTemporaryOrganizationBrandingRoutes, type TemporaryBrandingReader } from "../features/organization-branding-demo/index.js";
import { createReadableCollection } from "../integrations/mongodb/index.js";
import { createCorsMiddleware, createErrorHandler, createNotFoundHandler } from "../middleware/index.js";
import type { Principal } from "../types/index.js";

type AppDependencies = Readonly<{
  config: ApiConfig;
  logger: Logger;
  resolvePrincipal?: PrincipalResolver;
  organizationGateway?: OrganizationGateway;
  membersService?: MembersService;
  lifecycleService?: OrganizationLifecycleService;
  organizationSettingsReader?: OrganizationSettingsReader;
  organizationSettingsUpdater?: OrganizationSettingsUpdater;
  authService?: AuthService;
  temporaryBrandingDemoReader?: TemporaryBrandingReader;
  identity?: UserProfileRouteDependencies;
  userInvitations?: Omit<UserInvitationRouteDependencies, "principalResolver"> & Readonly<{
    activeMembershipsFor: (userId: string) => Promise<readonly Readonly<{ workspaceId: string }>[]>;
  }>;
  identitySessions?: UserSessionsRouteDependencies;
  resolveIdentityPrincipal?: (token: string) => Promise<Principal | null>;
  authentication?: OidcSignInControllerDependencies;
}>;

export const createApp = ({
  config,
  logger,
  resolvePrincipal,
  organizationGateway,
  membersService,
  lifecycleService,
  organizationSettingsReader,
  organizationSettingsUpdater,
  authService = createAuthService(),
  temporaryBrandingDemoReader,
  identity,
  userInvitations,
  identitySessions,
  resolveIdentityPrincipal,
  authentication
}: AppDependencies): Express => {
  const app = express();
  app.disable("x-powered-by");
  app.use(createHttpLogger({
    logger,
    format: config.environment === "production" ? "combined" : "dev"
  }));
  app.use(createCorsMiddleware({ origin: config.webOrigin }));
  app.use(express.json({ limit: apiRuntime.jsonBodyLimit }));

  const authenticatedPrincipal: PrincipalResolver = async request => {
    if (resolvePrincipal) return resolvePrincipal(request);
    const token = readBearerToken(request);
    const legacyPrincipal = await authService.resolvePrincipal(token);
    if (legacyPrincipal || !token || !resolveIdentityPrincipal) return legacyPrincipal;
    return resolveIdentityPrincipal(token);
  };
  const users = createReadableCollection<{ _id: string; displayName?: string }>("users", ["_id"]);
  const profileRoutes = identity
    ? createUserProfileRoutes({
        ...identity,
        recordProfileSignal: (signal) => {
          identity.recordProfileSignal?.(signal);
          const write = signal.outcome === "error" ? logger.error : logger.info;
          write("Identity user profile gateway query.", signal);
        }
      })
    : undefined;
  const sessionRoutes = identitySessions
    ? createUserSessionsRoutes({
        ...identitySessions,
        recordSessionAudit: (event) => {
          identitySessions.recordSessionAudit?.(event);
          logger.warn("Identity session revocation attempted.", event);
        }
      })
    : undefined;
  const userInvitationRoutes = userInvitations
    ? createUserInvitationRoutes({
        ...userInvitations,
        principalResolver: {
          resolve: async (authorizationHeader) => {
            const token = authorizationHeader?.match(/^Bearer\s+([A-Za-z0-9_-]{40,64})$/i)?.[1] ?? null;
            const user = await authService.resolvePrincipal(token);
            if (!user) return { kind: "unauthenticated" };
            const memberships = await userInvitations.activeMembershipsFor(user.userId);
            if (memberships.length === 0) return { kind: "no-active-workspace" };
            if (memberships.length > 1) return { kind: "workspace-selection-required" };
            const [membership] = memberships;
            if (!membership) return { kind: "no-active-workspace" };
            return { kind: "resolved", principal: { userId: user.userId, workspaceId: membership.workspaceId } };
          }
        }
      })
    : undefined;
  const featureRouters = [
    createHealthRoutes({ environment: config.environment, serviceName: apiRuntime.serviceName }),
    createAuthRoutes(authService),
    createOrganizationRoutes({
      webOrigin: config.webOrigin,
      resolvePrincipal: authenticatedPrincipal,
      ...(organizationGateway ? { gateway: organizationGateway } : {}),
      ...(membersService ? { membersService } : {}),
      ...(lifecycleService ? { lifecycleService } : {}),
      ...(organizationSettingsReader ? { settingsReader: organizationSettingsReader } : {}),
      ...(organizationSettingsUpdater ? { settingsUpdater: organizationSettingsUpdater } : {}),
      logger
    }),
    createWorkspaceRoutes({
      repository: createWorkspaceRepository({
        organizations: createReadableCollection("organizations", ["_id", "ownerId"]),
        workspaces: createReadableCollection("workspaces", ["_id", "orgId"]),
        memberships: createReadableCollection("memberships", ["_id", "workspaceId", "userId"]),
        userById: async userId => users.findOne({ _id: userId })
      }),
      resolveWorkspacePrincipal: request => authenticatedPrincipal(request),
      logger
    }),
    ...(profileRoutes ? [profileRoutes] : []),
    ...(sessionRoutes ? [sessionRoutes] : []),
    ...(userInvitationRoutes ? [userInvitationRoutes] : []),
    ...(authentication ? [createOidcSignInRoutes({
      ...authentication,
      recordInvalidSignIn: () => {
        authentication.recordInvalidSignIn?.();
        logger.warn("Identity sign-in verification failed.", {
          event: "identity.sign_in.failed",
          module: "identity",
          increment: 1
        });
      },
      recordSignInSignal: (signal) => {
        authentication.recordSignInSignal?.(signal);
        const write = signal.outcome === "error" ? logger.error : logger.info;
        write("Identity sign-in callback completed.", signal);
      }
    })] : [])
  ];
  if (config.temporaryOrganizationBrandingDemo) {
    if (!temporaryBrandingDemoReader) throw new Error("Temporary organization-branding demo auth requires its workspace reader.");
    featureRouters.push(createTemporaryOrganizationBrandingRoutes({
      config: config.temporaryOrganizationBrandingDemo,
      reader: temporaryBrandingDemoReader,
      emitReadSignal: signal => {
        const context = { ...signal };
        if (signal.outcome === "error" || !signal.withinBudget) logger.warn("Organization branding read signal.", context);
        else logger.info("Organization branding read signal.", context);
      }
    }));
  }
  for (const featureRouter of featureRouters) app.use(featureRouter);
  app.use(createNotFoundHandler());
  app.use(createErrorHandler({ logger }));
  return app;
};
