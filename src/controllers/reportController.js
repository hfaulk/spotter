import { Resend } from "resend";
import supabase from "../config/supabase.js";

const resend = new Resend(process.env.RESEND_API_KEY);

export const submitReport = async (req, res) => {
  try {
    // 1. Safely default all incoming data
    const reference = req.body.reference || "Unknown Reference";
    const type = req.body.type || "unknown";
    const reason = req.body.reason || "No reason provided";

    let userId = req.user?.id || null;
    let username = "Anonymous";

    // 2. Safely check for the access token, wrapping in try/catch just in case the JWT is malformed
    if (!userId && req.cookies && req.cookies.access_token) {
      try {
        const { data, error } = await supabase.auth.getUser(
          req.cookies.access_token,
        );
        if (!error && data?.user?.id) {
          userId = data.user.id;
        }
      } catch (err) {
        console.error("Auth extraction error:", err);
        // Non-fatal, continue as anonymous
      }
    }

    // 3. Fetch username if we successfully identified a user
    if (userId) {
      try {
        const { data: userData } = await supabase
          .from("user")
          .select("username")
          .eq("user_id", userId)
          .single();
        if (userData?.username) username = userData.username;
      } catch (e) {
        console.error("Failed to fetch username:", e);
      }
    }

    let extraContext = "";
    let targetSpotIds = [];
    let isAutoHidden = false;
    let maxReportCount = 0;

    // 4. Safely parse targets
    try {
      if (type === "map" && typeof reference === "string") {
        const coords = reference.match(/(-?\d+\.\d+), (-?\d+\.\d+)/);
        if (coords) {
          const lat = parseFloat(coords[1]);
          const lon = parseFloat(coords[2]);
          const { data: spots } = await supabase
            .from("spot")
            .select("spot_id, spot_title")
            .gte("spot_latitude", lat - 0.01)
            .lte("spot_latitude", lat + 0.01)
            .gte("spot_longitude", lon - 0.01)
            .lte("spot_longitude", lon + 0.01)
            .eq("active", true);

          if (spots && spots.length > 0) {
            targetSpotIds = spots.map((s) => s.spot_id);
            extraContext =
              `<p><strong>Nearby Spots Targeted:</strong></p><ul>` +
              spots
                .map((s) => `<li>${s.spot_title} (ID: ${s.spot_id})</li>`)
                .join("") +
              `</ul>`;
          }
        }
      } else if (
        type === "private" &&
        typeof reference === "string" &&
        reference.includes("Spot ID:")
      ) {
        targetSpotIds.push(reference.replace("Spot ID:", "").trim());
      } else if (
        type === "shared" &&
        typeof reference === "string" &&
        reference.includes("Shared Spot Token:")
      ) {
        const token = reference.replace("Shared Spot Token:", "").trim();
        const { data: s } = await supabase
          .from("spot")
          .select("spot_id")
          .eq("spot_share_token", token)
          .single();
        if (s) targetSpotIds.push(s.spot_id);
      }
    } catch (dbSearchError) {
      console.error("Target identification error:", dbSearchError);
    }

    // 5. The Auto-Moderator Logic
    if (targetSpotIds.length > 0) {
      for (const targetId of targetSpotIds) {
        try {
          if (userId) {
            // Logged-in users get upserted so they can't report the same spot twice
            await supabase
              .from("spot_report")
              .upsert(
                { spot_id: targetId, reporter_id: userId, reason: reason },
                { onConflict: "spot_id, reporter_id" },
              );
          } else {
            // Anonymous users just get inserted.
            // If your DB strictly requires a reporter_id, this insert will fail.
            // Because it's wrapped in a try/catch, the route will survive and still send the email!
            await supabase
              .from("spot_report")
              .insert({ spot_id: targetId, reason: reason });
          }

          const { count, error: countErr } = await supabase
            .from("spot_report")
            .select("*", { count: "exact", head: true })
            .eq("spot_id", targetId);

          if (!countErr && count > maxReportCount) maxReportCount = count;

          if (count >= 3) {
            await supabase
              .from("spot")
              .update({ active: false })
              .eq("spot_id", targetId);
            isAutoHidden = true;
          }
        } catch (modErr) {
          console.error("Auto-moderator logic error:", modErr);
        }
      }
    }

    // 6. Construct & Send Email
    const subjectPrefix = isAutoHidden
      ? "🚨 URGENT (AUTO-HIDDEN)"
      : "🚨 Spotter Report";
    let statusMessage = "";

    if (targetSpotIds.length > 0) {
      statusMessage = `<p><strong>Highest Unique Report Count on Targeted Spots:</strong> ${maxReportCount}</p>`;
      if (isAutoHidden) {
        statusMessage += `
            <div style="background-color: #fef2f2; border: 1px solid #f87171; padding: 12px; border-radius: 6px; margin-bottom: 16px;">
                <p style="color: #b91c1c; font-weight: bold; margin: 0;">⚠️ AUTOMATIC ACTION TAKEN</p>
                <p style="color: #991b1b; margin: 4px 0 0 0; font-size: 0.9rem;">Targeted spot(s) hit the report threshold and were automatically removed from the public map. Review the content to verify.</p>
            </div>`;
      }
    }

    await resend.emails.send({
      from: "Spotter Support <noreply@spotter.harryfaulkner.com>",
      to: "hfaulkner2006@gmail.com",
      subject: `${subjectPrefix}: ${type}`,
      html: `
        <h2 style="color: #0f172a;">New User Report</h2>
        <p><strong>Reporter:</strong> ${username} (ID: ${userId || "Anonymous"})</p>
        <p><strong>Type:</strong> ${type}</p>
        <p><strong>Reference / ID:</strong> ${reference}</p>
        ${statusMessage}
        ${extraContext}
        <p><strong>User's Reason:</strong></p>
        <blockquote style="background: #f8fafc; padding: 16px; border-left: 4px solid #ef4444; border-radius: 4px; color: #334155;">
            ${reason}
        </blockquote>
      `,
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Resend Report Error:", error);
    res.status(500).json({ error: "Failed to send report" });
  }
};
