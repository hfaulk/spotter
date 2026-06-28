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
    // Fetch all report rows including report_id so individual reports can be dismissed.
    const { data: reportRows } = await supabase
      .from("spot_report")
      .select("report_id, spot_id, reason, created_at")
      .order("created_at", { ascending: false });

    // Group reports by spot_id, keeping each report as its own object
    const reportMap = {};
    for (const row of reportRows || []) {
      if (!reportMap[row.spot_id]) {
        reportMap[row.spot_id] = { reports: [], latestAt: null };
      }
      reportMap[row.spot_id].reports.push({
        report_id: row.report_id,
        reason: row.reason,
        created_at: row.created_at,
      });
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
          reports: reportMap[spot.spot_id]?.reports || [],
          latestReportAt: reportMap[spot.spot_id]?.latestAt || null,
        }))
        // Most-reported first
        .sort((a, b) => b.reports.length - a.reports.length);
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

// ===== DISMISS INDIVIDUAL REPORT =====
// POST /admin/reports/:reportId/dismiss
export const dismissReport = async (req, res) => {
  const { reportId } = req.params;

  const { error } = await supabase
    .from("spot_report")
    .delete()
    .eq("report_id", reportId);

  if (error) {
    return res
      .status(500)
      .json({ success: false, error: "Failed to dismiss report" });
  }

  res.json({ success: true });
};
