import { getUser, handleAuthCallback } from "https://esm.sh/@netlify/identity";

const $ = (id) => document.getElementById(id);
const set = (id, value) => { const node = $(id); if (node) node.textContent = value; };
const esc = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
const empty = (message) => `<p class="empty">${esc(message)}</p>`;
const label = (value) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function chart(id, values, bars = false) {
  const svg = $(id); if (!svg) return;
  const high = Math.max(1, ...values), grid = [44, 94, 144].map((y) => `<line class="axis" x1="0" x2="400" y1="${y}" y2="${y}"/>`).join("");
  if (bars) { const width = 360 / values.length; svg.innerHTML = grid + values.map((v, i) => `<rect class="bar" x="${20 + i * (width + 4)}" y="${174 - v / high * 150}" width="${Math.max(6, width)}" height="${v / high * 150}" rx="3"/>`).join(""); return; }
  const points = values.map((v, i) => `${i / Math.max(1, values.length - 1) * 400},${174 - v / high * 150}`).join(" ");
  svg.innerHTML = `<defs><linearGradient id="fade" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#e5a93d" stop-opacity=".33"/><stop offset="1" stop-color="#e5a93d" stop-opacity="0"/></linearGradient></defs>${grid}<polygon points="0,174 ${points} 400,174" fill="url(#fade)"/><polyline class="area" points="${points}" fill="none"/>`;
}

function calendar(activity) {
  const node = $("calendar"); if (!node) return;
  const now = new Date(), year = now.getFullYear(), month = now.getMonth(), active = new Set(activity.map((x) => new Date(x.date).toISOString().slice(0, 10)));
  set("calendar-label", now.toLocaleDateString(undefined, { month: "long", year: "numeric" }));
  const headers = ["M", "T", "W", "T", "F", "S", "S"].map((x) => `<div class="weekday">${x}</div>`).join(""), start = (new Date(year, month, 1).getDay() + 6) % 7, days = new Date(year, month + 1, 0).getDate();
  node.innerHTML = headers + Array.from({ length: start }, () => "<div></div>").join("") + Array.from({ length: days }, (_, i) => { const key = new Date(year, month, i + 1).toISOString().slice(0, 10); return `<div class="day ${active.has(key) ? "active" : ""} ${key === now.toISOString().slice(0, 10) ? "today" : ""}">${i + 1}</div>`; }).join("");
}

function render(data) {
  const { profile, summary, activity = [], personalRecords = {}, achievements = [], achievementProgress = [], progression, leaderboard = [] } = data;
  set("name", profile.displayName); set("tier", `${profile.membershipTier} · ${profile.trainingLevel}`); set("greeting", `Hold the line, ${profile.displayName}.`); set("training-level", `${progression?.rank || profile.trainingLevel} · Level ${progression?.level || 1} · ${profile.membershipTier} membership`);
  const avatar = $("avatar"); if (profile.avatarUrl) avatar.innerHTML = `<img alt="" src="${esc(profile.avatarUrl)}">`; else avatar.textContent = (profile.displayName || "A").slice(0, 2).toUpperCase();
  Object.entries({ workouts: summary.completedWorkouts, reps: summary.kettlebellReps, rounds: summary.bjjRounds, minutes: summary.trainingMinutes, streak: summary.currentStreak, xp: summary.weeklyXp, position: summary.leaderboardPosition ? `#${summary.leaderboardPosition}` : "—" }).forEach(([id, value]) => set(id, value)); set("weekly-xp", `${summary.weeklyXp} XP`); set("hero-streak", summary.currentStreak);
  $("history").innerHTML = activity.length ? activity.slice(0, 8).map((x) => `<div class="history-row"><div><b>${esc(x.title)}</b><small>${label(x.date)}</small></div><b>${Math.round(x.minutes || 0)} min</b></div>`).join("") : empty("No completed sessions yet. Finish a workout or BJJ session to begin your history.");
  const records = [...(personalRecords.kettlebell || []).map((x) => ({ name: x.day ? `Kettlebell · Day ${x.day}` : "Kettlebell", value: `${x.kettlebellReps || 0} reps` })), ...(personalRecords.bjj || []).map((x) => ({ name: "Dominion Rounds", value: `${x.rounds_completed || 0} rounds` }))].slice(0, 4);
  $("records").innerHTML = records.length ? records.map((x) => `<div class="record"><span>${esc(x.name)}</span><b>${esc(x.value)}</b></div>`).join("") : empty("Personal records will appear after eligible completed sessions.");
  const badges = achievementProgress.length ? achievementProgress : achievements.map((x) => ({ ...x, unlocked: true })); $("badges").innerHTML = badges.length ? badges.map((x) => `<div class="badge ${x.unlocked ? "" : "locked"}"><div class="icon">${x.unlocked ? "✦" : "◇"}</div><b>${esc(x.name)}</b><small>${x.unlocked ? "Unlocked" : `${Math.min(x.value || 0, x.threshold || 0)}/${x.threshold || 0}`}</small></div>`).join("") : empty("Achievements are earned from completed training.");
  $("leaderboard").innerHTML = leaderboard.length ? leaderboard.map((x) => `<div class="rank ${x.rank_position === summary.leaderboardPosition ? "me" : ""}"><b>#${x.rank_position}</b><span>${esc(x.display_name || "Athlete")}</span><small>${x.score} XP</small></div>`).join("") : empty("Leaderboard data will appear after the first official ranking snapshot.");
  const daily = Array.from({ length: 7 }, (_, i) => { const day = new Date(); day.setDate(day.getDate() - 6 + i); const key = day.toISOString().slice(0, 10); return activity.filter((x) => new Date(x.date).toISOString().slice(0, 10) === key).length; });
  const weekly = Array.from({ length: 4 }, (_, i) => activity.filter((x) => { const age = Date.now() - new Date(x.date).valueOf(); return age <= (4 - i) * 604800000 && age > (3 - i) * 604800000; }).length); chart("weekly-chart", daily); chart("monthly-chart", weekly, true); calendar(activity);
  if (profile.membershipTier === "Premium") $("premium")?.remove(); window.dispatchEvent(new CustomEvent("gamification-loaded", { detail: data }));
}

async function boot() {
  try { await handleAuthCallback(); } catch { /* Identity setup is independent per Netlify project. */ }
  let user; try { user = await getUser(); } catch { user = null; }
  if (!user) { location.replace("/?auth=required"); return; }
  const response = await fetch("/api/dashboard"); if (response.status === 401) { location.replace("/?auth=required"); return; } if (!response.ok) throw new Error("Dashboard data is temporarily unavailable."); render(await response.json());
}
boot().catch((error) => { set("greeting", "Command center unavailable."); set("training-level", error.message); });
