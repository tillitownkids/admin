"use client";

import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";

import { finishClipUploadAction, startClipUploadAction } from "@/actions/sequenceAction";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

/** Adds a clip made outside the admin (in Magnific, or by Claude) as a take of this sequence's clip. */
export function ClipUploadButton({
  sceneId,
  planned,
  onUploaded,
}: {
  sceneId: string;
  /** A clip plan must exist: the take is added to its clip. */
  planned: boolean;
  onUploaded: (message: { type: "success" | "error"; text: string }) => Promise<void> | void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const start = await startClipUploadAction(sceneId, file.type, file.size);
      if (!start.ok) throw new Error(start.error);
      const { error } = await createClient().storage.from(start.bucket).uploadToSignedUrl(start.path, start.token, file, { contentType: file.type });
      if (error) throw new Error(`The clip could not be uploaded: ${error.message}`);
      const finish = await finishClipUploadAction(sceneId, start.path);
      if (!finish.ok) throw new Error(finish.error);
      await onUploaded({
        type: "success",
        text: finish.inUse ? "The uploaded clip is now the clip in use." : "The uploaded clip was added as a take. Choose it below to put it in use.",
      });
    } catch (error) {
      await onUploaded({ type: "error", text: error instanceof Error ? error.message : "The clip could not be uploaded." });
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) upload(file);
        }}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={uploading || !planned}
        title={planned ? "Add a clip made outside the admin as a take" : "Plan the clip first; the upload becomes a take of it."}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
        Upload clip
      </Button>
    </>
  );
}
