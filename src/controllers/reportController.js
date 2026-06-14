import { Resend } from "resend";
import supabase from "../config/supabase.js"; // Ensure we have the supabase client

const resend = new Resend(process.env.RESEND_API_KEY);

export const submitReport = async (req, res) => {
  try {
    const { reference, type, reason } = req.body;

    // Access the user from the request object provided by requireAuth
    const userId = req.user?.id;

    let username = "Anonymous";
    if (userId) {
      const { data: userData } = await supabase
        .from("user")
        .select("username")
        .eq("user_id", userId)
        .single();

      if (userData) username = userData.username;
    }

    // 2. Fetch extra context if it's a map report (the hotspot data)
    let extraContext = "";
    if (type === "map") {
      // Extract lat/lon from the reference string
      const coords = reference.match(/(-?\d+\.\d+), (-?\d+\.\d+)/);
      if (coords) {
        const [lat, lon] = [coords[1], coords[2]];
        // Fetch spots near these coordinates
        const { data: spots } = await supabase
          .from("spot")
          .select("spot_id, spot_title")
          .gte("spot_latitude", parseFloat(lat) - 0.01)
          .lte("spot_latitude", parseFloat(lat) + 0.01)
          .gte("spot_longitude", parseFloat(lon) - 0.01)
          .lte("spot_longitude", parseFloat(lon) + 0.01);

        if (spots && spots.length > 0) {
          extraContext =
            `<p><strong>Nearby Spots:</strong></p><ul>` +
            spots
              .map((s) => `<li>${s.spot_title} (ID: ${s.spot_id})</li>`)
              .join("") +
            `</ul>`;
        }
      }
    }

    // 3. Send email via Resend
    await resend.emails.send({
      from: "Spotter Support <noreply@spotter.harryfaulkner.com>",
      to: "hfaulkner2006@gmail.com",
      subject: `🚨 Spotter Report: ${type}`,
      html: `
        <h2 style="color: #0f172a;">New User Report</h2>
        <p><strong>Reporter:</strong> ${username} (ID: ${userId || "N/A"})</p>
        <p><strong>Type:</strong> ${type}</p>
        <p><strong>Reference / ID:</strong> ${reference}</p>
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
