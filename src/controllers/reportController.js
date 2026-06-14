import { Resend } from "resend";
import supabase from "../config/supabase.js";

const resend = new Resend(process.env.RESEND_API_KEY);

export const submitReport = async (req, res) => {
  try {
    const { reference, type, reason } = req.body;

    const session = await supabase.auth.getSession();
    const userId = req.user?.id || session.data.session?.user?.id;

    let username = "Anonymous";
    if (userId) {
      const { data: userData } = await supabase
        .from("user")
        .select("username")
        .eq("user_id", userId)
        .single();
      if (userData) username = userData.username;
    }

    let extraContext = "";
    let targetSpotIds = []; // Changed to an array to handle multiple spots in a hotspot
    let isAutoHidden = false;
    let maxReportCount = 0;

    // 1. Identify the targets
    if (type === "map") {
      const coords = reference.match(/(-?\d+\.\d+), (-?\d+\.\d+)/);
      if (coords) {
        const [lat, lon] = [coords[1], coords[2]];
        const { data: spots } = await supabase
          .from("spot")
          .select("spot_id, spot_title")
          .gte("spot_latitude", parseFloat(lat) - 0.01)
          .lte("spot_latitude", parseFloat(lat) + 0.01)
          .gte("spot_longitude", parseFloat(lon) - 0.01)
          .lte("spot_longitude", parseFloat(lon) + 0.01)
          .eq("active", true);

        if (spots && spots.length > 0) {
          // Target EVERY active spot in this specific map hotspot
          targetSpotIds = spots.map((s) => s.spot_id);

          extraContext =
            `<p><strong>Nearby Spots Targeted:</strong></p><ul>` +
            spots
              .map((s) => `<li>${s.spot_title} (ID: ${s.spot_id})</li>`)
              .join("") +
            `</ul>`;
        }
      }
    } else if (type === "private" && reference.includes("Spot ID:")) {
      targetSpotIds.push(reference.replace("Spot ID:", "").trim());
    } else if (type === "shared" && reference.includes("Shared Spot Token:")) {
      const token = reference.replace("Shared Spot Token:", "").trim();
      const { data: s } = await supabase
        .from("spot")
        .select("spot_id")
        .eq("spot_share_token", token)
        .single();
      if (s) targetSpotIds.push(s.spot_id);
    }

    // 2. THE AUTO-MODERATOR LOGIC (Loops through targeted spots)
    if (targetSpotIds.length > 0 && userId) {
      for (const targetId of targetSpotIds) {
        // A. Log the report
        await supabase
          .from("spot_report")
          .upsert(
            { spot_id: targetId, reporter_id: userId, reason: reason },
            { onConflict: "spot_id, reporter_id" },
          );

        // B. Count distinct reports for this spot
        const { count } = await supabase
          .from("spot_report")
          .select("*", { count: "exact", head: true })
          .eq("spot_id", targetId);

        if (count > maxReportCount) maxReportCount = count;

        // C. The Killswitch (Set to 1 for your testing, change to 3 later)
        if (count >= 3) {
          // If you have Row Level Security enabled in Supabase, ensure your backend
          // uses the SERVICE_ROLE key, otherwise the update might be blocked!
          await supabase
            .from("spot")
            .update({ active: false })
            .eq("spot_id", targetId);
          isAutoHidden = true;
        }
      }
    }

    // 3. Construct & Send Email
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
        <p><strong>Reporter:</strong> ${username} (ID: ${userId || "N/A"})</p>
        <p><strong>Type:</strong> ${type}</p>
        <p><strong>Reference / ID:</strong> ${reference}</p>
        ${statusMessage}
        ${extraContext}
        <p><strong>User's Reason:</strong></p>
        <blockquote style="background: #f8fafc; padding: 16px; border-left: 4px solid #ef4444; border-radius: 4px; color: #334155;">
            ${reason || "No reason provided by user."}
        </blockquote>
      `,
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Resend Report Error:", error);
    res.status(500).json({ error: "Failed to send report" });
  }
};
