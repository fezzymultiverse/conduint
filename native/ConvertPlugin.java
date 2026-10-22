package com.fezzy.conduint;

import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;

/**
 * Convert (V0.44.0): video to audio.
 *
 *  capabilities()   {ffmpeg: true when the ffmpeg-kit library is in this build, copy: true}
 *  toAudio({path, name, format, kbps, mono})
 *      format "mp3"  MP3 through ffmpeg-kit (libmp3lame). kbps 320/256/192/128/96/64, or 0 for VBR highest quality. mono = one channel.
 *      format "m4a"  AAC in an M4A file through ffmpeg-kit.
 *      format "copy" the video's own audio track copied as it is into an M4A file, no re-encode (no library needed, AAC audio only).
 *      Result {path, name, size}: a file in the app cache. The web side saves it where the person picks, then calls clean().
 *  clean({path})    deletes a file inside the app cache
 *
 * ffmpeg-kit is reached by reflection, so this build compiles and runs without it: capabilities() then says ffmpeg is false and only
 * "copy" works. scripts/patch-android.sh adds the library when CONDUINT_FFMPEG_DEP is set.
 */
@CapacitorPlugin(name = "Convert")
public class ConvertPlugin extends Plugin {

    private static final String KIT = "com.arthenica.ffmpegkit.FFmpegKit";
    private static final String RC = "com.arthenica.ffmpegkit.ReturnCode";

    private static boolean hasFfmpeg() {
        try {
            Class.forName(KIT);
            return true;
        } catch (Throwable t) {
            return false;
        }
    }

    private File dir() {
        File d = new File(getContext().getCacheDir(), "conv");
        //noinspection ResultOfMethodCallIgnored
        d.mkdirs();
        return d;
    }

    private static String clean(String n) {
        if (n == null) n = "audio";
        n = n.replaceAll("\\.[A-Za-z0-9]{1,5}$", "").replaceAll("[\\\\/:*?\"<>|\\x00-\\x1f]", "_").trim();
        if (n.isEmpty()) n = "audio";
        return n.length() > 100 ? n.substring(0, 100) : n;
    }

    @PluginMethod
    public void capabilities(PluginCall call) {
        JSObject o = new JSObject();
        o.put("ffmpeg", hasFfmpeg());
        o.put("copy", true);
        call.resolve(o);
    }

    @PluginMethod
    public void toAudio(final PluginCall call) {
        final String path = call.getString("path");
        final String name = clean(call.getString("name"));
        final String format = call.getString("format", "mp3");
        final int kbps = call.getInt("kbps", 192);
        final boolean mono = Boolean.TRUE.equals(call.getBoolean("mono", false));
        if (path == null || path.isEmpty() || !new File(path).isFile()) {
            call.reject("The source file is not there.");
            return;
        }
        new Thread(new Runnable() {
            @Override
            public void run() {
                File out = null;
                try {
                    File in = new File(path);
                    String ext = "mp3".equals(format) ? "mp3" : "m4a";
                    out = new File(dir(), name + "." + ext);
                    if (out.exists()) //noinspection ResultOfMethodCallIgnored
                        out.delete();
                    if ("copy".equals(format)) copyAudio(in, out);
                    else encode(in, out, format, kbps, mono);
                    if (!out.isFile() || out.length() == 0) throw new IllegalStateException("The converter made an empty file.");
                    JSObject o = new JSObject();
                    o.put("path", out.getAbsolutePath());
                    o.put("name", out.getName());
                    o.put("size", out.length());
                    call.resolve(o);
                } catch (Throwable t) {
                    if (out != null) //noinspection ResultOfMethodCallIgnored
                        out.delete();
                    String m = t.getMessage();
                    call.reject(m == null || m.isEmpty() ? "Conversion failed." : m);
                }
            }
        }, "cnd-convert").start();
    }

    /** ffmpeg-kit, called by reflection: executeWithArguments(String[]) then the session's return code and log. */
    private void encode(File in, File out, String format, int kbps, boolean mono) throws Exception {
        if (!hasFfmpeg()) throw new IllegalStateException("The MP3 converter library is not in this build. Choose Original audio, or rebuild with CONDUINT_FFMPEG_DEP set.");
        List<String> a = new ArrayList<>();
        a.add("-y");
        a.add("-i");
        a.add(in.getAbsolutePath());
        a.add("-vn");
        a.add("-map");
        a.add("0:a:0");
        if ("mp3".equals(format)) {
            a.add("-c:a");
            a.add("libmp3lame");
            if (kbps <= 0) {
                a.add("-q:a");
                a.add("0");
            } else {
                a.add("-b:a");
                a.add(kbps + "k");
            }
            a.add("-id3v2_version");
            a.add("3");
        } else {
            a.add("-c:a");
            a.add("aac");
            a.add("-b:a");
            a.add((kbps <= 0 ? 256 : kbps) + "k");
            a.add("-movflags");
            a.add("+faststart");
        }
        if (mono) {
            a.add("-ac");
            a.add("1");
        }
        a.add("-map_metadata");
        a.add("0");
        a.add(out.getAbsolutePath());
        Class<?> kit = Class.forName(KIT);
        Object session = kit.getMethod("executeWithArguments", String[].class).invoke(null, (Object) a.toArray(new String[0]));
        Object rc = session.getClass().getMethod("getReturnCode").invoke(session);
        Class<?> rcc = Class.forName(RC);
        boolean ok = (Boolean) rcc.getMethod("isSuccess", rcc).invoke(null, rc);
        if (!ok) {
            String log = "";
            try {
                Object l = session.getClass().getMethod("getAllLogsAsString").invoke(session);
                log = l == null ? "" : l.toString();
            } catch (Throwable ignored) { }
            if (log.contains("Stream map") || log.contains("matches no streams") || log.contains("does not contain any stream")) {
                throw new IllegalStateException("This video has no audio track.");
            }
            String tail = log.length() > 300 ? log.substring(log.length() - 300) : log;
            throw new IllegalStateException("The converter stopped. " + tail.trim());
        }
    }

    /** The first audio track, copied untouched into an MP4 container (M4A). Only AAC can go into it this way. */
    private void copyAudio(File in, File out) throws Exception {
        MediaExtractor ex = new MediaExtractor();
        MediaMuxer mx = null;
        boolean started = false;
        try {
            ex.setDataSource(in.getAbsolutePath());
            int ti = -1;
            MediaFormat f = null;
            for (int i = 0; i < ex.getTrackCount(); i++) {
                MediaFormat fm = ex.getTrackFormat(i);
                String m = fm.getString(MediaFormat.KEY_MIME);
                if (m != null && m.startsWith("audio/")) {
                    ti = i;
                    f = fm;
                    break;
                }
            }
            if (ti < 0 || f == null) throw new IllegalStateException("This video has no audio track.");
            String mime = f.getString(MediaFormat.KEY_MIME);
            if (!"audio/mp4a-latm".equals(mime)) {
                throw new IllegalStateException("The audio in this video is " + mime + ", not AAC, so it cannot be copied as it is. The MP3 converter can convert it.");
            }
            mx = new MediaMuxer(out.getAbsolutePath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            int mi = mx.addTrack(f);
            ex.selectTrack(ti);
            mx.start();
            started = true;
            ByteBuffer buf = ByteBuffer.allocate(1 << 20);
            MediaCodec.BufferInfo bi = new MediaCodec.BufferInfo();
            while (true) {
                buf.clear();
                int n = ex.readSampleData(buf, 0);
                if (n < 0) break;
                bi.offset = 0;
                bi.size = n;
                bi.presentationTimeUs = ex.getSampleTime();
                bi.flags = (ex.getSampleFlags() & MediaExtractor.SAMPLE_FLAG_SYNC) != 0 ? MediaCodec.BUFFER_FLAG_KEY_FRAME : 0;
                mx.writeSampleData(mi, buf, bi);
                ex.advance();
            }
        } finally {
            try {
                if (mx != null) {
                    if (started) mx.stop();
                    mx.release();
                }
            } catch (Throwable ignored) { }
            ex.release();
        }
    }

    @PluginMethod
    public void clean(PluginCall call) {
        try {
            String p = call.getString("path");
            if (p != null && !p.isEmpty()) {
                File f = new File(p).getCanonicalFile();
                String root = getContext().getCacheDir().getCanonicalPath() + File.separator;
                if (f.getPath().startsWith(root) && f.isFile()) //noinspection ResultOfMethodCallIgnored
                    f.delete();
            }
        } catch (Throwable ignored) { }
        call.resolve();
    }
}
