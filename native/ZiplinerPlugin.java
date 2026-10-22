package com.fezzy.conduint;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import net.lingala.zip4j.ZipFile;
import net.lingala.zip4j.model.ZipParameters;
import net.lingala.zip4j.model.enums.AesKeyStrength;
import net.lingala.zip4j.model.enums.CompressionLevel;
import net.lingala.zip4j.model.enums.CompressionMethod;
import net.lingala.zip4j.model.enums.EncryptionMethod;

import org.apache.commons.compress.archivers.sevenz.SevenZArchiveEntry;
import org.apache.commons.compress.archivers.sevenz.SevenZFile;

import java.io.*;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.*;
import java.util.zip.CRC32;

import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** Zipliner: password protected archives. ZIP with AES-128 / AES-256 (zip4j), 7z with AES-256 (own writer, header
 *  encrypted so even file names are hidden; reading uses commons-compress). Works on real paths (All files access). */
@CapacitorPlugin(name = "Zipliner")
public class ZiplinerPlugin extends Plugin {
    private volatile boolean cancelled = false;

    @PluginMethod public void cancel(PluginCall c) { cancelled = true; c.resolve(); }

    /* ---------- browse real folders for the picker ---------- */
    @PluginMethod public void list(PluginCall c) {
        File d = new File(c.getString("path", "/storage/emulated/0"));
        File[] fs = d.listFiles();
        if (fs == null) { c.reject("Cannot open this folder. Is All files access on?"); return; }
        Arrays.sort(fs, (a, b) -> a.isDirectory() != b.isDirectory() ? (a.isDirectory() ? -1 : 1) : a.getName().compareToIgnoreCase(b.getName()));
        JSArray arr = new JSArray();
        for (File f : fs) {
            if (f.getName().startsWith(".")) continue;
            JSObject o = new JSObject();
            o.put("name", f.getName()); o.put("path", f.getAbsolutePath()); o.put("dir", f.isDirectory());
            o.put("size", f.isDirectory() ? 0 : f.length()); arr.put(o);
        }
        JSObject r = new JSObject(); r.put("items", arr); r.put("parent", d.getParent()); c.resolve(r);
    }

    /* ---------- is it encrypted, and what is inside (names only when readable) ---------- */
    @PluginMethod public void inspect(PluginCall c) {
        File f = new File(c.getString("path", ""));
        JSObject r = new JSObject();
        try {
            if (f.getName().toLowerCase().endsWith(".7z")) {
                r.put("type", "7z");
                try (SevenZFile z = new SevenZFile(f)) { r.put("encrypted", false); r.put("count", countEntries(z)); }
                catch (Exception e) { r.put("encrypted", true); }
            } else {
                ZipFile z = new ZipFile(f);
                r.put("type", "zip"); r.put("encrypted", z.isEncrypted()); r.put("count", z.getFileHeaders().size());
            }
            c.resolve(r);
        } catch (Exception e) { c.reject(msg(e)); }
    }
    private int countEntries(SevenZFile z) throws IOException { int n = 0; while (z.getNextEntry() != null) n++; return n; }

    /* ---------- create ---------- */
    @PluginMethod public void create(PluginCall c) {
        cancelled = false;
        try {
            JSArray ps = c.getArray("paths");
            List<File> src = new ArrayList<>();
            for (int i = 0; i < ps.length(); i++) src.add(new File(ps.getString(i)));
            String dest = c.getString("dest"), fmt = c.getString("format", "zip"), pw = c.getString("password", "");
            int bits = c.getInt("bits", 256), level = c.getInt("level", 6);
            if (src.isEmpty()) { c.reject("Pick at least one file or folder."); return; }
            File out = new File(dest);
            if (out.exists()) { c.reject("A file with that name already exists in that folder."); return; }
            File parent = out.getParentFile(); if (parent != null) parent.mkdirs();
            try {
                if (fmt.equals("7z")) write7z(src, out, pw);
                else createZip(src, out, pw, bits, level);
            } catch (Exception e) { out.delete(); throw e; }
            if (cancelled) { out.delete(); c.reject("Cancelled", "CANCELLED"); return; }
            JSObject r = new JSObject(); r.put("size", out.length()); r.put("path", out.getAbsolutePath()); c.resolve(r);
        } catch (Exception e) { c.reject(msg(e)); }
    }

    private void createZip(List<File> src, File out, String pw, int bits, int level) throws Exception {
        boolean enc = pw != null && !pw.isEmpty();
        ZipFile z = enc ? new ZipFile(out, pw.toCharArray()) : new ZipFile(out);
        ZipParameters p = new ZipParameters();
        if (level == 0) p.setCompressionMethod(CompressionMethod.STORE);
        else { p.setCompressionMethod(CompressionMethod.DEFLATE); p.setCompressionLevel(level <= 1 ? CompressionLevel.FASTEST : level >= 9 ? CompressionLevel.MAXIMUM : CompressionLevel.NORMAL); }
        if (enc) { p.setEncryptFiles(true); p.setEncryptionMethod(EncryptionMethod.AES); p.setAesKeyStrength(bits == 128 ? AesKeyStrength.KEY_STRENGTH_128 : AesKeyStrength.KEY_STRENGTH_256); }
        for (File f : src) { if (cancelled) return; ping(f.getName(), 0);
            if (f.isDirectory()) z.addFolder(f, p); else z.addFile(f, p); }
    }

    private void extractZipHere(File f, File dest, String pw) throws Exception {
        ZipFile z = new ZipFile(f);
        if (z.isEncrypted()) { if (pw == null || pw.isEmpty()) throw new IOException("This archive needs a password."); z.setPassword(pw.toCharArray()); }
        z.extractAll(dest.getAbsolutePath());
    }

    /* ---------- extract ---------- */
    @PluginMethod public void extract(PluginCall c) {
        cancelled = false;
        File f = new File(c.getString("path", "")), dest = new File(c.getString("dest", ""));
        String pw = c.getString("password", "");
        try {
            dest.mkdirs();
            if (f.getName().toLowerCase().endsWith(".7z")) extract7z(f, dest, pw);
            else extractZipHere(f, dest, pw);
            c.resolve();
        } catch (Exception e) {
            String m = msg(e);
            if (m.toLowerCase().contains("wrong password") || m.toLowerCase().contains("password")) m = "Wrong password, or the archive needs one.";
            c.reject(m);
        }
    }

    private void extract7z(File f, File dest, String pw) throws Exception {
        SevenZFile z = (pw == null || pw.isEmpty()) ? new SevenZFile(f) : new SevenZFile(f, pw.toCharArray());
        try {
            String root = dest.getCanonicalPath() + File.separator;
            SevenZArchiveEntry e; byte[] buf = new byte[65536];
            while ((e = z.getNextEntry()) != null) {
                if (cancelled) throw new IOException("Cancelled");
                File t = new File(dest, e.getName());
                if (!t.getCanonicalPath().startsWith(root)) continue; // path traversal guard
                if (e.isDirectory()) { t.mkdirs(); continue; }
                t.getParentFile().mkdirs(); ping(e.getName(), 0);
                try (OutputStream o = new BufferedOutputStream(new FileOutputStream(t))) {
                    int n; while ((n = z.read(buf)) > 0) o.write(buf, 0, n);
                }
            }
        } finally { z.close(); }
    }

    /* ---------- 7z writer: one solid folder, Copy data + AES-256 coder, encrypted header ---------- */
    private static final byte[] AES_ID = {(byte) 0x06, (byte) 0xF1, (byte) 0x07, (byte) 0x01};
    private static final int CYCLES = 19;

    private static class Ent { File f; String name; long size; long crc; }

    private void collect(File f, String prefix, List<Ent> out) {
        String n = prefix + f.getName();
        if (f.isDirectory()) { File[] k = f.listFiles(); if (k != null) { Arrays.sort(k); for (File c : k) collect(c, n + "/", out); } }
        else { Ent e = new Ent(); e.f = f; e.name = n; e.size = f.length(); out.add(e); }
    }

    private static byte[] deriveKey(byte[] salt, String pw) throws Exception {
        byte[] p = pw.getBytes("UTF-16LE");
        MessageDigest sha = MessageDigest.getInstance("SHA-256");
        byte[] ctr = new byte[8];
        long rounds = 1L << CYCLES;
        for (long i = 0; i < rounds; i++) {
            sha.update(salt); sha.update(p);
            for (int b = 0; b < 8; b++) ctr[b] = (byte) (i >>> (8 * b));
            sha.update(ctr);
        }
        return sha.digest();
    }

    private static byte[] aesProps(byte[] salt, byte[] iv) {
        byte[] r = new byte[2 + salt.length + iv.length];
        r[0] = (byte) (CYCLES | 0x80 | 0x40);
        r[1] = (byte) (((salt.length - 1) << 4) | (iv.length - 1));
        System.arraycopy(salt, 0, r, 2, salt.length); System.arraycopy(iv, 0, r, 2 + salt.length, iv.length);
        return r;
    }

    private static void num(ByteArrayOutputStream o, long v) { // 7z variable length number
        int first = 0, mask = 0x80, i;
        byte[] b = new byte[8];
        for (i = 0; i < 8; i++) {
            if (v < (1L << (7 * (i + 1)))) { first |= (int) (v >>> (8 * i)); break; }
            b[i] = (byte) v; v >>>= 8; first |= mask; mask >>>= 1;
        }
        o.write(first);
        o.write(b, 0, i);
    }
    private static void le32(ByteArrayOutputStream o, long v) { for (int i = 0; i < 4; i++) o.write((int) (v >>> (8 * i)) & 255); }
    private static void le64(OutputStream o, long v) throws IOException { for (int i = 0; i < 8; i++) o.write((int) (v >>> (8 * i)) & 255); }
    private static void coderBlock(ByteArrayOutputStream o, long unpack, byte[] props) {
        o.write(0x0B); num(o, 1); o.write(0);              // folders, not external
        num(o, 1);                                          // one coder
        o.write(0x04 | 0x20); o.write(AES_ID, 0, 4);        // 4 byte id, has properties
        num(o, props.length); o.write(props, 0, props.length);
        o.write(0x0C); num(o, unpack);                      // unpack size
    }

    private void write7z(List<File> srcs, File out, String pw) throws Exception {
        if (pw == null || pw.isEmpty()) throw new IOException("7z needs a password here. Use ZIP for an archive without one.");
        List<Ent> ents = new ArrayList<>();
        for (File f : srcs) collect(f, "", ents);
        if (ents.isEmpty()) throw new IOException("Nothing to pack: the folders are empty.");
        long total = 0; for (Ent e : ents) total += e.size;

        SecureRandom rnd = new SecureRandom();
        byte[] salt = new byte[16], iv = new byte[16]; rnd.nextBytes(salt); rnd.nextBytes(iv);
        byte[] key = deriveKey(salt, pw);
        Cipher ci = Cipher.getInstance("AES/CBC/NoPadding");
        ci.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new IvParameterSpec(iv));

        try (RandomAccessFile raf = new RandomAccessFile(out, "rw")) {
            raf.setLength(0); raf.write(new byte[32]);
            byte[] buf = new byte[65536 * 4]; byte[] carry = new byte[0];
            long done = 0;
            BufferedOutputStream bo = new BufferedOutputStream(new FileOutputStream(raf.getFD()), 1 << 16);
            for (Ent e : ents) {
                if (cancelled) return;
                ping(e.name, done);
                CRC32 crc = new CRC32();
                try (InputStream in = new FileInputStream(e.f)) {
                    int n;
                    while ((n = in.read(buf)) > 0) {
                        crc.update(buf, 0, n);
                        byte[] all = new byte[carry.length + n]; System.arraycopy(carry, 0, all, 0, carry.length); System.arraycopy(buf, 0, all, carry.length, n);
                        int full = all.length - (all.length % 16);
                        if (full > 0) bo.write(ci.update(all, 0, full));
                        carry = Arrays.copyOfRange(all, full, all.length);
                        if (cancelled) return;
                    }
                }
                e.crc = crc.getValue(); done += e.size;
            }
            byte[] last = Arrays.copyOf(carry, 16 * ((carry.length + 15) / 16));
            if (last.length > 0) bo.write(ci.doFinal(last)); else ci.doFinal();
            bo.flush();
            long packSize = 16L * ((total + 15) / 16);

            // plain header
            ByteArrayOutputStream h = new ByteArrayOutputStream();
            h.write(0x01); h.write(0x04);
            h.write(0x06); num(h, 0); num(h, 1); h.write(0x09); num(h, packSize); h.write(0x00);
            h.write(0x07); coderBlock(h, total, aesProps(salt, iv)); h.write(0x00);
            h.write(0x08); h.write(0x0D); num(h, ents.size());
            h.write(0x09); for (int i = 0; i < ents.size() - 1; i++) num(h, ents.get(i).size);
            h.write(0x0A); h.write(1); for (Ent e : ents) le32(h, e.crc);
            h.write(0x00); h.write(0x00);
            h.write(0x05); num(h, ents.size());
            ByteArrayOutputStream nm = new ByteArrayOutputStream(); nm.write(0);
            for (Ent e : ents) { nm.write(e.name.getBytes("UTF-16LE")); nm.write(0); nm.write(0); }
            h.write(0x11); num(h, nm.size()); h.write(nm.toByteArray());
            h.write(0x00); h.write(0x00);
            byte[] hdr = h.toByteArray();
            CRC32 hc = new CRC32(); hc.update(hdr);

            // encrypt the header with a fresh salt and iv, so file names stay hidden too
            byte[] salt2 = new byte[16], iv2 = new byte[16]; rnd.nextBytes(salt2); rnd.nextBytes(iv2);
            Cipher c2 = Cipher.getInstance("AES/CBC/NoPadding");
            c2.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(deriveKey(salt2, pw), "AES"), new IvParameterSpec(iv2));
            byte[] eh = c2.doFinal(Arrays.copyOf(hdr, 16 * ((hdr.length + 15) / 16)));
            long hdrPos = raf.getFilePointer(); // after packed data
            raf.seek(hdrPos); raf.write(eh);

            ByteArrayOutputStream n = new ByteArrayOutputStream();
            n.write(0x17);
            n.write(0x06); num(n, hdrPos - 32); num(n, 1); n.write(0x09); num(n, eh.length); n.write(0x00);
            n.write(0x07); coderBlock(n, hdr.length, aesProps(salt2, iv2));
            n.write(0x0A); n.write(1); le32(n, hc.getValue()); n.write(0x00);
            n.write(0x00);
            byte[] next = n.toByteArray();
            CRC32 nc = new CRC32(); nc.update(next);
            long nextOff = raf.getFilePointer() - 32; raf.write(next);

            ByteArrayOutputStream sh = new ByteArrayOutputStream();
            le64(sh, nextOff); le64(sh, next.length); le32(sh, nc.getValue());
            byte[] shb = sh.toByteArray(); CRC32 sc = new CRC32(); sc.update(shb);
            raf.seek(0);
            raf.write(new byte[]{'7', 'z', (byte) 0xBC, (byte) 0xAF, 0x27, 0x1C, 0, 4});
            ByteArrayOutputStream f4 = new ByteArrayOutputStream(); le32(f4, sc.getValue()); raf.write(f4.toByteArray());
            raf.write(shb);
        }
    }

    private void ping(String name, long done) {
        JSObject o = new JSObject(); o.put("name", name); o.put("done", done);
        notifyListeners("zlProgress", o);
    }
    private static String msg(Exception e) { return e.getMessage() != null ? e.getMessage() : e.toString(); }
}
