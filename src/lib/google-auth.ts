import { OAuth2Client } from "google-auth-library";

function getGoogleClientId() {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!id) {
    throw new Error("GOOGLE_CLIENT_ID is not configured");
  }
  return id;
}

export type GoogleUser = {
  email: string;
  emailVerified: boolean;
  name: string;
  givenName: string;
  familyName: string;
  picture?: string;
  sub: string;
};

export async function verifyGoogleIdToken(credential: string): Promise<GoogleUser> {
  const client = new OAuth2Client(getGoogleClientId());
  const ticket = await client.verifyIdToken({
    idToken: credential,
    audience: getGoogleClientId(),
  });

  const payload = ticket.getPayload();
  if (!payload?.email || !payload.sub) {
    throw new Error("Invalid Google sign-in");
  }

  return {
    email: payload.email.trim().toLowerCase(),
    emailVerified: payload.email_verified ?? false,
    name: payload.name?.trim() || payload.email,
    givenName: payload.given_name?.trim() ?? "",
    familyName: payload.family_name?.trim() ?? "",
    picture: payload.picture,
    sub: payload.sub,
  };
}
