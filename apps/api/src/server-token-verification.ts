import {
  authenticateServerSite,
  type ServerSiteCredentialLookup,
} from "./site-authentication.js";
import {
  TokenVerificationUnavailableError,
  type TokenVerificationResult,
  VerificationTokenVerifier,
} from "./token-verification.js";

export type ServerTokenVerificationResult =
  | { outcome: "invalid_secret_key" }
  | { outcome: "unavailable" }
  | { outcome: "verified"; response: TokenVerificationResult };

/**
 * Binds private server credentials to token verification scope. The audience
 * is the authoritative site ID, never a client-supplied request field.
 */
export class ServerTokenVerificationService {
  public constructor(
    private readonly credentialLookup: ServerSiteCredentialLookup,
    private readonly verifier: VerificationTokenVerifier,
    private readonly issuer: string,
  ) {}

  public async verify(input: {
    secretKey: unknown;
    token: string;
    expectedAction: string;
    consume: boolean;
  }): Promise<ServerTokenVerificationResult> {
    let authenticatedSite;

    try {
      authenticatedSite = await authenticateServerSite(
        input.secretKey,
        this.credentialLookup,
      );
    } catch {
      return { outcome: "unavailable" };
    }

    if (authenticatedSite === null) {
      return { outcome: "invalid_secret_key" };
    }

    try {
      return {
        outcome: "verified",
        response: await this.verifier.verify({
          token: input.token,
          issuer: this.issuer,
          audience: authenticatedSite.siteId,
          customerId: authenticatedSite.customerId,
          siteId: authenticatedSite.siteId,
          expectedAction: input.expectedAction,
          consume: input.consume,
        }),
      };
    } catch (error) {
      if (error instanceof TokenVerificationUnavailableError) {
        return { outcome: "unavailable" };
      }

      return { outcome: "unavailable" };
    }
  }
}
