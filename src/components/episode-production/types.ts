export interface LocationLibraryRow {
  id: string;
  name: string;
  description: string;
  reference_image_url: string | null;
  generated_image_url?: string | null;
  magnific_identifier?: string | null;
}

export interface CharacterRow {
  id: string;
  name: string;
  description: string;
  reference_image_url: string | null;
  magnific_identifier?: string | null;
}


export interface EpisodeLocationRow {
  id: string;
  story_id: string;
  location_id: string;
  order_index: number;
  stylesheet_prompt: string;
  stylesheet_image_url: string | null;
  status: string; // pending | generating | generated | approved
  Location: LocationLibraryRow;
}

export interface SceneRow {
  id: string;
  episode_location_id: string;
  scene_number: number;
  description: string;
  storyboard_prompt: string;
  storyboard_image_url: string | null;
  storyboard_status: string; // pending | generating | generated | approved
  beats_status: string; // pending | generating | generated | approved
  order_index: number;
  locationName: string;
  magnific_identifier?: string | null;
}


export interface BeatRow {
  id: string;
  scene_id: string;
  beat_number: number;
  action: string;
  camera: string;
  motion: string;
  dialogue: string;
  sfx: string;
  order_index: number;
}

export interface StoryRow {
  id: string;
  topic: string;
  content: string;
  mode: string;
  production_stage: string;
}
