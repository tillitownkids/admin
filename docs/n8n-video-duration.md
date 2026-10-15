# Clip length in the n8n video workflow

Every clip comes back **15 seconds long**, whatever length the app asks for. The app is not the
cause: it sends the planned length in `duration`, and the video workflow does not pass it on.

## What was measured (2026-10-15)

Eight clips generated on 2026-10-15, probed with `ffprobe`:

| `duration` sent by the app | Length of the clip returned |
| --- | --- |
| 5 | 15.104 s |
| 6 | 15.104 s |
| 8 | 15.104 s |

Every clip was 15.104 s, so the workflow, or the Magnific request it builds, uses a fixed 15-second
length.

## What the app sends: `POST /webhook/generate-video`

One request per scene clip. A scene's beats play as timed shots inside that one clip, and
`duration` is the clip's total length: one of 4, 5, 6, 8, 10, 12 or 15.

```json
{
  "scenes": [{
    "id": "<scene uuid>",
    "shot": 1,
    "duration": 12,
    "videoPrompt": "… Shot 1 [0:00–0:06] — Panel 1. … Shot 2 [0:06–0:12] — Panel 2. …",
    "magnific_identifier": "<storyboard image id>",
    "references": { "characters": {}, "locations": {}, "objects": {} }
  }]
}
```

## What n8n needs to do

1. In the video workflow, map `scenes[0].duration` to the length (duration) field of the Magnific
   video request, in place of the fixed 15.
2. If the model only accepts some lengths, round up to the nearest one it accepts, never down: the
   prompt's timestamps and the dialogue are planned to fit `duration`.
3. Until this is done, a 12-second scene comes back as 15 seconds, and the shot timestamps in the
   prompt no longer match the clip.
