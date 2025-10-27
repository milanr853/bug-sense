import React, { useState, useRef } from "react";

export default function RecorderTool() {
  const [recording, setRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "video/webm; codecs=vp9",
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);
        chunks.current = [];
      };

      mediaRecorder.start();
      setRecording(true);
    } catch (err) {
      console.error("Error starting recording:", err);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const downloadRecording = () => {
    if (!recordedUrl) return;
    const a = document.createElement("a");
    a.href = recordedUrl;
    a.download = `bug-sense-recording-${Date.now()}.webm`;
    a.click();
  };

  return (
    <div className="w-full">
      {!recording ? (
        <button
          onClick={startRecording}
          className="w-full bg-green-500 text-white py-2 rounded-lg hover:bg-green-600"
        >
          🎥 Start Recording
        </button>
      ) : (
        <button
          onClick={stopRecording}
          className="w-full bg-red-500 text-white py-2 rounded-lg hover:bg-red-600"
        >
          ⏹ Stop Recording
        </button>
      )}

      {recordedUrl && (
        <div className="mt-3 flex flex-col items-center space-y-2">
          <video
            src={recordedUrl}
            controls
            className="rounded-lg shadow-md w-full max-h-48"
          ></video>
          <div className="flex gap-2">
            <button
              onClick={downloadRecording}
              className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
            >
              💾 Download
            </button>
            <button
              onClick={() =>
                chrome.runtime.sendMessage({
                  action: "OPEN_GIF_MAKER",
                  data: recordedUrl,
                })
              }
              className="bg-yellow-500 text-white px-3 py-1 rounded hover:bg-yellow-600"
            >
              🔁 Make GIF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

