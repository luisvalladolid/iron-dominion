import { upsertMember } from "./_airtable-members.mjs";

export default {
  async userSignup(event) {
    try {
      await upsertMember(event.user);
    } catch (error) {
      // Airtable is an account-profile mirror; a temporary API issue must not
      // prevent an athlete from completing Identity signup.
      console.error("Could not mirror Identity signup to Airtable", error);
    }
    const currentRoles = Array.isArray(event.user?.appMetadata?.roles)
      ? event.user.appMetadata.roles
      : [];
    // This role is stored in Identity app_metadata, not user-editable metadata.
    // It applies after the athlete's next sign-in or token refresh.
    return {
      user: {
        ...event.user,
        appMetadata: { ...event.user.appMetadata, roles: currentRoles.length ? currentRoles : ["member"] },
      },
    };
  },
  async userLogin(event) {
    try {
      await upsertMember(event.user);
    } catch (error) {
      console.error("Could not mirror Identity login to Airtable", error);
    }
  },
};
