import { getUser } from "@netlify/identity";
import { upsertMember } from "./_airtable-members.mjs";
import { syncProfile } from "./_profiles.mjs";

export default async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  const user = await getUser();
  if (!user) return new Response("Authentication required", { status: 401 });
  try {
    await syncProfile(user);
  } catch (error) {
    console.error("Could not sync member profile", error);
    return new Response("Could not sync member profile", { status: 502 });
  }
  try {
    const synced = await upsertMember(user);
    return Response.json({ synced, profileSynced: true });
  } catch (error) {
    // Airtable is an analytics mirror, never a prerequisite for Identity
    // sign-in or the private application profile.
    console.error("Could not sync member profile to Airtable", error);
    return Response.json({ synced: false, profileSynced: true, analyticsError: "Airtable sync is temporarily unavailable" });
  }
};

export const config = { path: "/api/account-profile", method: ["POST"] };
