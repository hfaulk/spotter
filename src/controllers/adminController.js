import supabase from "../config/supabase.js";

// ===== ADMIN AUTH MIDDLEWARE =====
// Checks req.user.id against ADMIN_USER_ID in .env.
// requireAuth must run before this — we only need to check identity here.
export const requireAdmin = (req, res, next) => {
  if (!process.env.ADMIN_USER_ID) {
    console.error("ADMIN_USER_ID is not set in environment variables");
    return res.status(403).render("error");
  }
  if (req.user.id !== process.env.ADMIN_USER_ID) {
    return res.status(403).render("error");
  }
  next();
};

export const serveAdmin = async (req, res) => {
  try {
    // ===== STATS =====
    const [
      { count: totalUsers },
      { count: totalSpots },
      { count: spotsThisWeek },
      { count: pendingReports },
    ] = await Promise.all([
      supabase.from("user").select("*", { count: "exact", head: true }),
      supabase
        .from("spot")
        .select("*", { count: "exact", head: true })
        .eq("active", true),
      supabase
        .from("spot")
        .select("*", { count: "exact", head: true })
        .eq("active", true)
        .gte(
          "spot_timestamp",
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        ),
      supabase
        .from("spot_report")
        .select("spot_id", { count: "exact", head: true }),
    ]);

    // ===== REPORTED SPOTS QUEUE =====
    // Fetch all report rows, grouped by spot, with the spot details attached.
    // We do two queries and join in JS to avoid relying on a DB view.
    const { data: reportRows } = await supabase
      .from("spot_report")
      .select("spot_id, reason, created_at")
      .order("created_at", { ascending: false });

    // Aggregate: count reports per spot and collect reasons
    const reportMap = {};
    for (const row of reportRows || []) {
      if (!reportMap[row.spot_id]) {
        reportMap[row.spot_id] = { count: 0, reasons: [], latestAt: null };
      }
      reportMap[row.spot_id].count++;
      if (row.reason) reportMap[row.spot_id].reasons.push(row.reason);
      if (!reportMap[row.spot_id].latestAt)
        reportMap[row.spot_id].latestAt = row.created_at;
    }

    // Fetch the spot details for those IDs (including inactive ones)
    const reportedSpotIds = Object.keys(reportMap);
    let reportedSpots = [];
    if (reportedSpotIds.length > 0) {
      const { data: spotRows } = await supabase
        .from("spot")
        .select("spot_id, spot_title, active, user_id, spot_timestamp")
        .in("spot_id", reportedSpotIds)
        .order("spot_timestamp", { ascending: false });

      // Fetch usernames for those spots
      const userIds = [...new Set((spotRows || []).map((s) => s.user_id))];
      const { data: userRows } = await supabase
        .from("user")
        .select("user_id, username")
        .in("user_id", userIds);

      const usernameMap = {};
      for (const u of userRows || []) usernameMap[u.user_id] = u.username;

      reportedSpots = (spotRows || [])
        .map((spot) => ({
          ...spot,
          username: usernameMap[spot.user_id] || "Unknown",
          reportCount: reportMap[spot.spot_id]?.count || 0,
          reasons: reportMap[spot.spot_id]?.reasons || [],
          latestReportAt: reportMap[spot.spot_id]?.latestAt || null,
        }))
        // Most-reported first
        .sort((a, b) => b.reportCount - a.reportCount);
    }

    // ===== RECENT REGISTRATIONS =====
    const { data: recentUsers } = await supabase
      .from("user")
      .select("user_id, username, first_name, last_name, created_at")
      .order("created_at", { ascending: false })
      .limit(20);

    res.render("admin", {
      activePage: "admin",
      stats: {
        totalUsers: totalUsers ?? "—",
        totalSpots: totalSpots ?? "—",
        spotsThisWeek: spotsThisWeek ?? "—",
        pendingReports: pendingReports ?? "—",
      },
      reportedSpots,
      recentUsers: recentUsers || [],
    });
  } catch (err) {
    console.error("Admin dashboard error:", err);
    res.status(500).render("error");
  }
};

// ===== TOGGLE SPOT VISIBILITY =====
// POST /admin/spots/:spotId/toggle-active
export const toggleSpotActive = async (req, res) => {
  const { spotId } = req.params;

  // Fetch current state
  const { data: spot, error: fetchError } = await supabase
    .from("spot")
    .select("active")
    .eq("spot_id", spotId)
    .single();

  if (fetchError || !spot) {
    return res.status(404).json({ success: false, error: "Spot not found" });
  }

  const { error: updateError } = await supabase
    .from("spot")
    .update({ active: !spot.active })
    .eq("spot_id", spotId);

  if (updateError) {
    return res
      .status(500)
      .json({ success: false, error: "Failed to update spot" });
  }

  res.json({ success: true, active: !spot.active });
};
