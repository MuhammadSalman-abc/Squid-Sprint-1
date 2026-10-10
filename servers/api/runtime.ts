import "dotenv/config";
import { createLogger } from "@workspace/logging";
import "./config/dns-override.js";
import { createApp, createIdentityRuntime } from "./bootstrap/index.js";
import { createApiConfig, readApiEnvironment } from "./config/index.js";
import { apiRuntime } from "./constants/index.js";
import { createMongoDbIntegration, workspaceBrandingMongoQueries } from "./integrations/index.js";
import { initializeIdentityMongoCollections } from "./features/identity/index.js";

export const apiRuntimePromise = (async () => {
  const config = createApiConfig(readApiEnvironment());
  if (config.environment === "production" && !config.mongodbUri) {
    throw new Error("MONGODB_URI must be configured for the production API.");
  }
  const logger = createLogger({
    service: apiRuntime.serviceName,
    level: config.logLevel,
    format: config.logFormat ?? (config.environment === "production" ? "json" : "pretty"),
    ...(config.environment === "development"
      ? { structuredHttpEndpoint: "http://127.0.0.1:3101/loki/api/v1/raw" }
      : {})
  });
  const database = createMongoDbIntegration({
    logger,
    ...(config.mongodbUri ? { uri: config.mongodbUri } : {})
  });
  await database.connect();
  if (config.mongodbUri) await initializeIdentityMongoCollections();
  const identity = config.mongodbUri ? createIdentityRuntime(database, config, logger) : undefined;
  const app = createApp({
    config,
    logger,
    ...(identity ? { identity: identity.profile } : {}),
    ...(identity ? { userInvitations: identity.userInvitations } : {}),
    ...(identity ? { identitySessions: identity.sessionManagement } : {}),
    ...(identity ? { resolveIdentityPrincipal: identity.resolveWorkspacePrincipal } : {}),
    ...(identity?.authentication ? { authentication: identity.authentication } : {}),
    ...(config.temporaryOrganizationBrandingDemo ? { temporaryBrandingDemoReader: workspaceBrandingMongoQueries } : {})
  });
  return Object.freeze({ app, config, database, logger });
})();
