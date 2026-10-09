import express, { type Express } from "express";
import "dotenv/config";
import "./config/dns-override.js";

import { createLogger } from "@workspace/logging";
import { createApp, createIdentityRuntime } from "./bootstrap/index.js";
import { createApiConfig, readApiEnvironment } from "./config/index.js";
import { apiRuntime } from "./constants/index.js";
import {
    createMongoDbIntegration,
    workspaceBrandingMongoQueries
} from "./integrations/index.js";
import { initializeIdentityMongoCollections } from "./features/identity/index.js";

const config = createApiConfig(readApiEnvironment());

const logger = createLogger({
    service: apiRuntime.serviceName,
    level: config.logLevel,
    format:
        config.logFormat ??
        (config.environment === "production" ? "json" : "pretty"),
    ...(config.environment === "development"
        ? {
            structuredHttpEndpoint:
                "http://127.0.0.1:3101/loki/api/v1/raw"
        }
        : {})
});

const database = createMongoDbIntegration({
    logger,
    ...(config.mongodbUri ? { uri: config.mongodbUri } : {})
});

const identity = config.mongodbUri
    ? createIdentityRuntime(database, config, logger)
    : undefined;

const configuredApp = createApp({
    config,
    logger,
    ...(identity ? { identity: identity.profile } : {}),
    ...(identity ? { userInvitations: identity.userInvitations } : {}),
    ...(identity ? { identitySessions: identity.sessionManagement } : {}),
    ...(identity?.authentication
        ? { authentication: identity.authentication }
        : {}),
    ...(config.temporaryOrganizationBrandingDemo
        ? {
            temporaryBrandingDemoReader:
                workspaceBrandingMongoQueries
        }
        : {})
});

const app: Express = express();
app.use(configuredApp);

try {
    await database.connect();

    if (config.mongodbUri) {
        await initializeIdentityMongoCollections();
    }
} catch (error: unknown) {
    if (config.environment === "production") {
        throw error;
    }

    logger.warn(
        "MongoDB connection failed; starting without persistence in development.",
        {
            error:
                error instanceof Error
                    ? error.message
                    : String(error)
        }
    );
}

export default app;