import React, { useRef, useState } from "react";

export default function RecorderTool() {
  const [recording, setRecording] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const startRecording = async () => {
    try {
      // Ask user which screen / window to record
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "video/webm; codecs=vp9",
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        setVideoUrl(url);
        chunksRef.current = [];
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setRecording(true);

      // Automatically stop if the user stops sharing
      stream.getVideoTracks()[0].addEventListener("ended", () => stopRecording());
    } catch (error) {
      console.error("Error starting recording:", error);
      setRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const downloadRecording = () => {
    if (!videoUrl) return;
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `bug-sense-recording-${Date.now()}.webm`;
    a.click();
  };

  return (
    <div className="space-y-3">
      <button
        onClick={recording ? stopRecording : startRecording}
        className={`w-full ${
          recording ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"
        } text-white py-2 rounded-lg`}
      >
        {recording ? "⏹ Stop Recording" : "🎥 Start Recording"}
      </button>

      {videoUrl && (
        <div className="text-center mt-3">
          <video
            src={videoUrl}
            controls
            className="rounded-lg shadow-md w-full max-h-48"
          ></video>
          <button
            onClick={downloadRecording}
            className="mt-2 bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
          >
            💾 Download
          </button>
        </div>
      )}
    </div>
  );
}

