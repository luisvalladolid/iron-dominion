const membersTable = "Members";

function setting(name) {
  return globalThis.Netlify?.env?.get(name) || process.env[name] || "";
}

function configuration() {
  const token = setting("AIRTABLE_PERSONAL_ACCESS_TOKEN");
  const baseId = setting("AIRTABLE_BASE_ID");
  return token && baseId ? { token, baseId } : null;
}

function airtableUrl(baseId, table, params = {}) {
  // A record update uses "Members/<record id>". Encode each path part rather
  // than the whole string so Airtable receives a real record path, not "%2F".
  const resource = String(table).split("/").map(encodeURIComponent).join("/");
  const url = new URL(`https://api.airtable.com/v0/${baseId}/${resource}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }
  return url;
}

async function request(config, method, table, { body, params } = {}) {
  const response = await fetch(airtableUrl(config.baseId, table, params), {
    method,
    headers: {
      Authorization: `Bearer ${config.token}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Airtable request failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  return response.json();
}

function escapeFormula(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function valueFrom(user, ...keys) {
  for (const key of keys) if (user?.[key]) return user[key];
  return "";
}

/**
 * Mirrors the non-secret Netlify Identity profile into Airtable.
 * It intentionally returns false until the site's Airtable PAT is configured,
 * so an unfinished integration never blocks account signup or login.
 */
export async function upsertMember(user) {
  const config = configuration();
  if (!config || !user?.id || !user?.email) return false;

  const metadata = user.userMetadata || user.user_metadata || {};
  const roles = Array.isArray(user.roles) ? user.roles.join(", ") : "";
  const now = new Date().toISOString();
  const fields = {
    Email: user.email,
    "Full name": metadata.full_name || metadata.fullName || "",
    "Identity user ID": user.id,
    "Account created (ISO)": valueFrom(user, "createdAt", "created_at") || now,
    "Last signed in (ISO)": now,
    Role: roles,
    "Confirmation status": user.confirmedAt || user.confirmed_at ? "confirmed" : "pending confirmation",
    "Metadata JSON": JSON.stringify(metadata),
  };

  const found = await request(config, "GET", membersTable, {
    params: {
      maxRecords: "1",
      filterByFormula: `{Identity user ID} = '${escapeFormula(user.id)}'`,
    },
  });
  const record = found.records?.[0];
  if (record) {
    await request(config, "PATCH", `${membersTable}/${record.id}`, { body: { fields } });
  } else {
    await request(config, "POST", membersTable, { body: { fields } });
  }
  return true;
}
