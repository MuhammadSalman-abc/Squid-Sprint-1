import { randomBytes, randomUUID } from "node:crypto";
import { systemClock } from "@workspace/kernel";
import type { Logger } from "@workspace/logging";
import type { ApiConfig, OidcApiConfiguration } from "../types/index.js";
import { createIdentityUserBootstrap, createIdentitySessionManager, createUserProfileGateway, createUserInvitationGateway, createUserInvitationQueryService, createIdentityPolicyEvaluator, createInvitationService, createSecureInvitationToken, createInvitationOperationSignalEmitter } from "../features/identity/index.js";
import type { UserProfileRouteDependencies } from "../features/identity/index.js";
import type { UserSessionsRouteDependencies } from "../features/identity/index.js";
import {
  createOidcFlowCookie,
  createPrincipalResolver,
  createSessionCookieResolver
} from "../features/authentication/index.js";
import type { OidcProviderPort, OidcSignInControllerDependencies } from "../features/authentication/index.js";
import { createWorkspaceBootstrap } from "../features/workspace/index.js";
import type { MongoDbIntegration } from "../integrations/index.js";
import type { Principal as WorkspacePrincipal } from "../types/index.js";
import {
  createIdentityUserModel,
  createSessionModel,
  createSessionQueryAdapter,
  createUserProfileQueryAdapter,
  createWorkspaceMembershipQueryAdapter,
  createMongoSignInTransactionRunner
} from "../integrations/mongodb/index.js";
import { createOidcProvider } from "../integrations/identity-provider/index.js";

const createVerifiedIdentityProvider = (configuration: OidcApiConfiguration) =>
  createOidcProvider({ providers: configuration.providers });

const unavailableIdentityProvider: OidcProviderPort = Object.freeze({
  createAuthorizationRequest: () => Promise.resolve({ kind: "provider-unavailable" as const }),
  verifyCallback: () => Promise.resolve({ kind: "provider-unavailable" as const })
});

export type IdentityRuntime = Readonly<{
  profile: UserProfileRouteDependencies;
  userInvitations: Readonly<{
    activeMembershipsFor: (userId: string) => Promise<readonly Readonly<{
      workspaceId: string;
      role?: string;
      guest?: boolean;
    }>[]>;
    list: ReturnType<typeof createUserInvitationQueryService>["list"];
    invite: ReturnType<typeof createUserInvitationQueryService>["invite"];
    revoke: ReturnType<typeof createUserInvitationQueryService>["revoke"];
    resend: ReturnType<typeof createUserInvitationQueryService>["resend"];
  }>;
  authentication: OidcSignInControllerDependencies;
  sessionManagement: UserSessionsRouteDependencies;
  resolveWorkspacePrincipal: (token: string) => Promise<WorkspacePrincipal | null>;
}>;

export const createIdentityRuntime = (database: MongoDbIntegration, config: ApiConfig, logger: Logger): IdentityRuntime => {
  const sessions = createSessionModel(database.connection);
  const sessionPort = createSessionQueryAdapter(sessions);
  const users = createIdentityUserModel(database.connection);
  const membershipPort = createWorkspaceMembershipQueryAdapter(database.connection);
  const transactionRunner = createMongoSignInTransactionRunner(database.connection);
  const identityProvisioning = createIdentityUserBootstrap({
    createId: randomUUID,
    createSessionToken: () => randomBytes(32).toString("base64url"),
    now: () => new Date(systemClock.now()),
    deviceLabel: "Unknown device"
  });
  const resolveSession = createSessionCookieResolver({ sessions: sessionPort });
  const resolveWorkspacePrincipal = async (token: string): Promise<WorkspacePrincipal | null> => {
    const session = await resolveSession(`workspace_session=${token}`);
    if (!session) return null;
    const workspaceIds = [...new Set((await membershipPort.activeMembershipsFor(session.userId)).map(({ workspaceId }) => workspaceId))];
    return workspaceIds.length > 0 ? { userId: session.userId, workspaceIds } : null;
  };
  const principalResolver = createPrincipalResolver({
    resolveSession,
    invalidateResolvedSession: resolveSession.invalidateSession,
    memberships: membershipPort
  });
  const evaluateInvitationPolicy = createIdentityPolicyEvaluator({
    resolveActor: async (principal) => {
      const activeMemberships = await membershipPort.activeMembershipsFor(principal.userId);
      const membership = activeMemberships.find(({ workspaceId }) => workspaceId === principal.workspaceId);
      return membership ? { role: membership.role ?? "", guest: membership.guest === true } : null;
    }
  });
  const invitationLink = (token: string): string => {
    const url = new URL("/workspace/invitations/accept", config.webOrigin);
    url.searchParams.set("token", token);
    return url.toString();
  };
  const invitationCommands = createUserInvitationQueryService({
      gateway: createUserInvitationGateway(),
      evaluatePolicy: evaluateInvitationPolicy,
      logger: { warn: (message, meta) => { logger.warn(message, meta); } },
      invite: createInvitationService({
        gateway: createUserInvitationGateway(),
        now: () => new Date(systemClock.now()),
        createToken: createSecureInvitationToken,
        createInvitationUrl: invitationLink,
        auditRefusal: (event) => { logger.warn("Workspace invitation refused.", { ...event }); return Promise.resolve(); },
        emitOperationSignal: createInvitationOperationSignalEmitter(logger)
      }).invite,
      now: () => new Date(systemClock.now()),
      createToken: createSecureInvitationToken,
      createInvitationUrl: invitationLink
    });
  const userInvitations = {
    activeMembershipsFor: membershipPort.activeMembershipsFor,
    ...invitationCommands
  };
  const profileDependencies = {
    principalResolver,
    gateway: createUserProfileGateway({ queryPort: createUserProfileQueryAdapter(users) })
  };
  const sessionManagement = {
    principalResolver,
    manager: createIdentitySessionManager(sessionPort)
  };

  const workspaceBootstrap = createWorkspaceBootstrap({
    transactionRunner,
    identity: identityProvisioning,
    createId: randomUUID
  });
  const oidcProvider = config.oidc
    ? createVerifiedIdentityProvider(config.oidc)
    : unavailableIdentityProvider;
  const flowCookie = createOidcFlowCookie({
    encryptionKey: config.oidc
      ? Buffer.from(config.oidc.flowCookieKey, "base64url")
      : randomBytes(32)
  });

  return Object.freeze({
    profile: profileDependencies,
    userInvitations,
    sessionManagement,
    resolveWorkspacePrincipal,
    authentication: Object.freeze({
      provider: oidcProvider,
      flowCookie,
      completion: workspaceBootstrap,
      callbackBaseUrl: config.oidc?.callbackBaseUrl ?? `http://${config.host}:${String(config.port)}`,
      webOrigin: config.webOrigin,
      secureCookies: config.environment === "production",
      sessions: sessionPort,
      resolveSession,
      invalidatePrincipalSession: principalResolver.invalidateSession
    })
  });
};
