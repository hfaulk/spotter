import { createClient } from "@supabase/supabase-js";
import supabase from "../config/supabase.js";
import crypto from "crypto";

export const createSpot = async ({
  user_id,
  spot_title,
  spot_description,
  spot_latitude,
  spot_longitude,
  spot_timestamp,
  image_path,
  image_shutter_speed,
  image_iso,
  image_aperture,
  image_focal_length,
  image_camera,
}) => {
  const spot_share_token = crypto.randomBytes(5).toString("hex"); // 10 char hex string

  const { data, error } = await supabase
    .from("spot")
    .insert({
      user_id,
      spot_title,
      spot_description: spot_description || null,
      spot_latitude: spot_latitude || null,
      spot_longitude: spot_longitude || null,
      spot_timestamp,
      spot_share_token,
      image_path: image_path || null,
      image_shutter_speed: image_shutter_speed || null,
      image_iso: image_iso || null,
      image_aperture: image_aperture || null,
      image_focal_length: image_focal_length || null,
      image_camera: image_camera || null,
    })
    .select()
    .single();

  return { data, error };
};

export const getSpotById = async (spotId, userId) => {
  const { data, error } = await supabase
    .from("spot")
    .select("*")
    .eq("spot_id", spotId)
    .eq("user_id", userId)
    .single();

  return { data, error };
};

export const getSpotByShareToken = async (token) => {
  const { data, error } = await supabase
    .from("spot")
    .select("*")
    .eq("spot_share_token", token)
    .single();

  return { data, error };
};

export const getSpotsByUser = async (userId) => {
  const { data, error } = await supabase
    .from("spot")
    .select("*")
    .eq("user_id", userId)
    .order("spot_timestamp", { ascending: false });

  return { data, error };
};

export const deleteStorageImage = async (imagePath) => {
  const { error } = await supabase.storage
    .from("spot-images")
    .remove([imagePath]);

  return { error };
};
