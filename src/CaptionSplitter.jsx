// ============================================================================
// CaptionSplitter.jsx (V2) — interactive caption editor (word-table model)
//
// THE MODEL (unchanged from V1): words are immutable atoms (id + raw start/end
// straight from Premiere). Cards only REFERENCE word ids + a highlight span. No
// timecodes are ever stored on cards — every in/out/duration is DERIVED live. So
// editing text, re-roling a word, splitting a breath, or MERGING words/cards can
// never desync timing: there are no stored timecodes to break.
//
// NEW IN V2
//  1. Audio scrub. Load the clip's .wav (mp3/m4a too). Real waveform via Web
//     Audio decode; a transport + playhead; click a word/card to hear just that
//     span; the word under the playhead lights up in the list and the timeline.
//  2. Merge timings. Two ops, both pure word-table edits:
//       • merge two adjacent WORD atoms into one (combine spans + text) — fixes
//         over-segmented transcripts (split numbers, "gon"+"na", stutters).
//       • merge CARDS up or down (combine their word spans).
//  3. Script in the timeline. The Needleman–Wunsch alignment renders as a lane
//     under the waveform: each word's script token sits beneath it, mismatches
//     in accent, transcript-only words dimmed, script-only words as inserts.
//
// IN:  Premiere transcript JSON (segments[].words[]) OR a word-table this tool
//      exported earlier (lossless round-trip). Audio is optional, loaded apart.
// OUT: captions JSON in the exact schema CaptionBuilder.jsx already reads
//      (drops into the AE pipeline as-is), plus the word-table for re-editing.
// ============================================================================

import React, { useMemo, useState, useRef, useCallback, useEffect } from "react";
import {
  Upload, Download, Scissors, ArrowUpToLine, ArrowDownToLine, FileText,
  AlertTriangle, Check, X, RotateCcw, Sliders, Type, Clock, Layers, ListChecks,
  Eye, Play, Pause, Link2, Music, ZoomIn, ZoomOut, Maximize2, Volume2,
  Undo2, Redo2, Keyboard, FileCode2, Copy, ClipboardCheck,
} from "lucide-react";

// ---------------------------------------------------------------- palette ---
const C = {
  bg: "#0c0c0d", panel: "#141416", panel2: "#1a1a1d", border: "#26262b",
  borderSoft: "#1f1f23", text: "#ECECEE", mut: "#86868f", mut2: "#5b5b63",
  accent: "#E5484D", accentDim: "#3a1c1e", accentText: "#ff8a8e",
  warn: "#E0A92E", warnDim: "#3a2f12", ok: "#3DD68C", okDim: "#123026",
  wave: "#3a3a42", waveHl: "#5a3034", blue: "#4a8cff",
};

// ---- embedded assets ------------------------------------------------------
// App logo (inlined so the build stays a single self-contained file).
const LOGO_SRC = "data:image/png;base64,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";

// The downstream After Effects script (CaptionBuilder.jsx) that consumes the
// exported captions JSON. Embedded as base64 and decoded (UTF-8 safe) so users
// can copy or download it straight from the app.
const CAPTION_BUILDER_B64 = "Ly8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PQ0KLy8gQ2FwdGlvbkJ1aWxkZXIuanN4ICDigJQgIEFmdGVyIEVmZmVjdHMgY2FwdGlvbiBidWlsZGVyDQovLyBQZXItcm93LXRpbWVkIHN0YWNrZWQgY2FwdGlvbnMgZnJvbSBhIGNhcHRpb25zIEpTT04uDQovLyBFUzMgLyBFeHRlbmRTY3JpcHQuIE9wZW4gYSBjb21wLCBydW4sIHBpY2sgdGhlIGNhcHRpb25zIEpTT04uDQovLw0KLy8gPj4+IEZPTlQgU0VUVVAgKGRvIHRoaXMgb25jZSwgZml4ZXMgYWxsIHRoZSBzdWJzdGl0dXRpb24gcHJvYmxlbXMpIDw8PA0KLy8gTmFtZS1iYXNlZCBmb250IHNldHRpbmcgaXMgdW5yZWxpYWJsZSBvbiB0aGlzIEFFLCBzbyB0aGUgc2NyaXB0IGNvcGllcyBmb250cw0KLy8gZnJvbSB0d28gcmVmZXJlbmNlIGxheWVycyB5b3UgbWFrZSBieSBoYW5kOg0KLy8gICAxLiBNYWtlIGEgdGV4dCBsYXllciwgc2V0IGl0IHRvIHlvdXIgSElHSExJR0hUIGZvbnQgaW4gdGhlIENoYXJhY3RlciBwYW5lbA0KLy8gICAgICAoRXVyb3BhIEdyb3Rlc2sgU0gpLCBuYW1lIGl0IGV4YWN0bHkgIFJFRl9ITA0KLy8gICAyLiBNYWtlIGEgdGV4dCBsYXllciwgc2V0IGl0IHRvIHlvdXIgU01BTEwgZm9udCAoSW50ZXIsIExpZ2h0KSwNCi8vICAgICAgbmFtZSBpdCBleGFjdGx5ICBSRUZfU00NCi8vICAgMy4gTGVhdmUgYm90aCBpbiB0aGUgY29tcCBhbmQgcnVuLiBUaGUgc2NyaXB0IGR1cGxpY2F0ZXMgdGhlbSBwZXIgcm93IGFuZA0KLy8gICAgICBvbmx5IGNoYW5nZXMgdGhlIHRleHQgKyBzaXplIC0+IHRoZSBmb250IGlzIG5ldmVyIHJlLXJlc29sdmVkLCBzbyBpdA0KLy8gICAgICBjYW4ndCBkcmlmdCB0byBUYWN0aWMgLyBJbnRlciBSZWd1bGFyLiBUaGUgUkVGIGxheWVycyBhcmUgYXV0by1kaXNhYmxlZA0KLy8gICAgICBhZnRlciB0aGUgYnVpbGQgKGRlbGV0ZSB0aGVtIHdoZW5ldmVyKS4NCi8vIElmIGEgUkVGIGxheWVyIGlzIG1pc3NpbmcgaXQgZmFsbHMgYmFjayB0byBzZXR0aW5nIHRoZSBmb250IGJ5IG5hbWUgKGZsYWt5KS4NCi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0NCg0KLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSBMQVlPVVQgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLQ0KdmFyIFNJWkVfSEwgICA9IDE2MDsNCnZhciBTSVpFX1NNICAgPSA1NTsNCnZhciBST1dfR0FQICAgPSAyMDsNCnZhciBZX0FOQ0hPUiAgPSAwLjU7ICAgICAgICAgIC8vIDAuNSA9IGNlbnRyZSwgMC43OCA9IGxvd2VyLXRoaXJkDQoNCi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gRk9OVFMgKHJlZmVyZW5jZSBsYXllcnMpIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0NCnZhciBGT05UX0hMX1JFRiA9ICJSRUZfSEwiOyAgIC8vIHRleHQgbGF5ZXIgc2V0IHRvIHRoZSBoaWdobGlnaHQgZm9udCBieSBoYW5kDQp2YXIgRk9OVF9TTV9SRUYgPSAiUkVGX1NNIjsgICAvLyB0ZXh0IGxheWVyIHNldCB0byB0aGUgc21hbGwgZm9udCAoSW50ZXIgTGlnaHQpIGJ5IGhhbmQNCg0KLy8gRmFsbGJhY2sgT05MWSBpZiBhIFJFRiBsYXllciBhYm92ZSBpcyBub3QgZm91bmQgKG5hbWUtYmFzZWQsIG1heSBzdWJzdGl0dXRlKToNCnZhciBGT05UX0hMICAgPSB7IGZhbWlseTogIkV1cm9wYSBHcm90ZXNrIFNIIiwgc3R5bGU6ICIiIH07DQp2YXIgRk9OVF9TTSAgID0geyBmYW1pbHk6ICJJbnRlciIsICAgICAgICAgICAgIHN0eWxlOiAiTGlnaHQiIH07DQoNCi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gQ0FTSU5HIC8gQ09MT1VSIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0NCnZhciBITF9DQVNFICAgPSAic2VudGVuY2UiOyAgIC8vICJzZW50ZW5jZSIgfCAibG93ZXIiIHwgInVwcGVyIiB8ICJ0aXRsZSINCnZhciBTTV9DQVNFICAgPSAiYXNpcyI7ICAgICAgIC8vICJhc2lzIiB8ICJsb3dlciIgfCAidXBwZXIiDQp2YXIgQ09MT1JfSEwgID0gWzEsIDEsIDFdOw0KdmFyIENPTE9SX1NNICA9IFsxLCAxLCAxXTsNCg0KLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSBUSU1JTkcgKGZsYXQtc2NoZW1hIGZhbGxiYWNrKSAtLS0tLS0tLS0tLS0tLS0tLQ0KLy8gUGVyLXJvdyBKU09OIChvYmplY3RzIHdpdGggaW4vb3V0KSBpcyBhcHBsaWVkIHZlcmJhdGltLiBUaGVzZSBvbmx5IGFwcGx5IHRvDQovLyB0aGUgT0xEIGZsYXQgc2NoZW1hIHdoZXJlIGhpZ2hsaWdodCBpcyBhIHBsYWluIHN0cmluZy4NCnZhciBIT0xEX1RPX05FWFQgPSBmYWxzZTsNCnZhciBUQUlMX1BBRCAgICAgPSAwLjMwOw0KdmFyIE1BWF9IT0xEICAgICA9IDA7DQoNCnZhciBMT0dfRk9OVFMgPSBmYWxzZTsgICAgICAgIC8vIHRydWU6IGJ1aWxkIGNhcmQgMSBvbmx5LCBhbGVydCByZXNvbHZlZCBmb250cywgc3RvcC4NCi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0NCg0KDQooZnVuY3Rpb24gKCkgew0KICAgIHZhciBjb21wID0gYXBwLnByb2plY3QuYWN0aXZlSXRlbTsNCiAgICBpZiAoIShjb21wICYmIGNvbXAgaW5zdGFuY2VvZiBDb21wSXRlbSkpIHsgYWxlcnQoIk9wZW4gYSBjb21wIGZpcnN0LiIpOyByZXR1cm47IH0NCg0KICAgIHZhciBmID0gRmlsZS5vcGVuRGlhbG9nKCJTZWxlY3QgY2FwdGlvbnMgSlNPTiIsICIqLmpzb24iKTsNCiAgICBpZiAoIWYpIHsgcmV0dXJuOyB9DQogICAgZi5lbmNvZGluZyA9ICJVVEYtOCI7DQogICAgZi5vcGVuKCJyIik7IHZhciB0eHQgPSBmLnJlYWQoKTsgZi5jbG9zZSgpOw0KICAgIGlmICh0eHQuY2hhckNvZGVBdCgwKSA9PT0gMHhGRUZGKSB0eHQgPSB0eHQuc3Vic3RyaW5nKDEpOw0KDQogICAgdmFyIGNhcmRzOw0KICAgIHRyeSB7IGNhcmRzID0gZXZhbCgiKCIgKyB0eHQgKyAiKSIpOyB9DQogICAgY2F0Y2ggKGUpIHsgYWxlcnQoIkNvdWxkbid0IHBhcnNlIEpTT046XG4iICsgZS50b1N0cmluZygpKTsgcmV0dXJuOyB9DQogICAgaWYgKCEoY2FyZHMgJiYgY2FyZHMubGVuZ3RoKSkgeyBhbGVydCgiTm8gY2FyZHMgaW4gSlNPTi4iKTsgcmV0dXJuOyB9DQoNCiAgICBmdW5jdGlvbiB0YzJzZWModGMpIHsNCiAgICAgICAgdmFyIHAgPSBTdHJpbmcodGMpLnNwbGl0KCIsIik7DQogICAgICAgIHZhciBobXMgPSBwWzBdLnNwbGl0KCI6Iik7DQogICAgICAgIHZhciBtcyA9IChwLmxlbmd0aCA+IDEpID8gcGFyc2VJbnQocFsxXSwgMTApIDogMDsNCiAgICAgICAgcmV0dXJuIHBhcnNlSW50KGhtc1swXSwgMTApICogMzYwMCArIHBhcnNlSW50KGhtc1sxXSwgMTApICogNjAgKyBwYXJzZUludChobXNbMl0sIDEwKSArIG1zIC8gMTAwMDsNCiAgICB9DQogICAgZnVuY3Rpb24gaGFzKHYpIHsgcmV0dXJuIHYgIT0gbnVsbCAmJiBTdHJpbmcodikgIT09ICIiOyB9DQogICAgZnVuY3Rpb24gcmVjYXNlSEwodywgbGVhZHMpIHsNCiAgICAgICAgaWYgKEhMX0NBU0UgPT09ICJ1cHBlciIpIHJldHVybiB3LnRvVXBwZXJDYXNlKCk7DQogICAgICAgIGlmIChITF9DQVNFID09PSAibG93ZXIiKSByZXR1cm4gdy50b0xvd2VyQ2FzZSgpOw0KICAgICAgICBpZiAoSExfQ0FTRSA9PT0gInRpdGxlIikgcmV0dXJuIHcudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC9cYlthLXpdL2csIGZ1bmN0aW9uIChjKSB7IHJldHVybiBjLnRvVXBwZXJDYXNlKCk7IH0pOw0KICAgICAgICB2YXIgcyA9IHcudG9Mb3dlckNhc2UoKTsNCiAgICAgICAgaWYgKGxlYWRzICYmIHMubGVuZ3RoKSBzID0gcy5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIHMuc3Vic3RyaW5nKDEpOw0KICAgICAgICByZXR1cm4gczsNCiAgICB9DQogICAgZnVuY3Rpb24gcmVjYXNlU00odykgew0KICAgICAgICBpZiAoU01fQ0FTRSA9PT0gImxvd2VyIikgcmV0dXJuIHcudG9Mb3dlckNhc2UoKTsNCiAgICAgICAgaWYgKFNNX0NBU0UgPT09ICJ1cHBlciIpIHJldHVybiB3LnRvVXBwZXJDYXNlKCk7DQogICAgICAgIHJldHVybiB3Ow0KICAgIH0NCiAgICBmdW5jdGlvbiBnZXRSZWZMYXllcihuYW1lKSB7DQogICAgICAgIGlmICghbmFtZSkgcmV0dXJuIG51bGw7DQogICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDw9IGNvbXAubnVtTGF5ZXJzOyBpKyspIHsNCiAgICAgICAgICAgIHZhciBMID0gY29tcC5sYXllcihpKTsNCiAgICAgICAgICAgIGlmIChMLm5hbWUgPT09IG5hbWUgJiYgTC5wcm9wZXJ0eSgiQURCRSBUZXh0IFByb3BlcnRpZXMiKSkgcmV0dXJuIEw7DQogICAgICAgIH0NCiAgICAgICAgcmV0dXJuIG51bGw7DQogICAgfQ0KICAgIHZhciByZWZITCA9IGdldFJlZkxheWVyKEZPTlRfSExfUkVGKTsNCiAgICB2YXIgcmVmU00gPSBnZXRSZWZMYXllcihGT05UX1NNX1JFRik7DQogICAgdmFyIHVzZWRSZWZzID0gW107DQogICAgaWYgKHJlZkhMKSB1c2VkUmVmcy5wdXNoKHJlZkhMKTsNCiAgICBpZiAocmVmU00pIHVzZWRSZWZzLnB1c2gocmVmU00pOw0KDQogICAgZnVuY3Rpb24gcGFyc2VGaWVsZChmaWVsZCwgZmJJbiwgZmJPdXQpIHsNCiAgICAgICAgaWYgKGZpZWxkID09IG51bGwpIHJldHVybiBudWxsOw0KICAgICAgICBpZiAodHlwZW9mIGZpZWxkID09PSAic3RyaW5nIikgew0KICAgICAgICAgICAgaWYgKGZpZWxkID09PSAiIikgcmV0dXJuIG51bGw7DQogICAgICAgICAgICByZXR1cm4geyB0ZXh0OiBmaWVsZCwgaW5TZWM6IGZiSW4sIG91dFNlYzogZmJPdXQgfTsNCiAgICAgICAgfQ0KICAgICAgICBpZiAoIWhhcyhmaWVsZC50ZXh0KSkgcmV0dXJuIG51bGw7DQogICAgICAgIHJldHVybiB7DQogICAgICAgICAgICB0ZXh0OiBmaWVsZC50ZXh0LA0KICAgICAgICAgICAgaW5TZWM6ICBoYXMoZmllbGRbImluIl0pICA/IHRjMnNlYyhmaWVsZFsiaW4iXSkgIDogZmJJbiwNCiAgICAgICAgICAgIG91dFNlYzogaGFzKGZpZWxkWyJvdXQiXSkgPyB0YzJzZWMoZmllbGRbIm91dCJdKSA6IGZiT3V0DQogICAgICAgIH07DQogICAgfQ0KDQogICAgLy8gQnVpbGQgYSBzdHlsZWQgdGV4dCBsYXllci4gSWYgcmVmTGF5ZXIgaXMgZ2l2ZW4sIERVUExJQ0FURSBpdCAoZm9udCBjb3BpZWQNCiAgICAvLyB2ZXJiYXRpbSwgbmV2ZXIgcmUtcmVzb2x2ZWQpLiBFbHNlIGNyZWF0ZSBmcmVzaCBhbmQgc2V0IGZvbnQgYnkgbmFtZStzdHlsZSwNCiAgICAvLyB2ZXJpZnlpbmcgQk9USCBmYW1pbHkgYW5kIHN0eWxlIG9uIHJlYWRiYWNrLg0KICAgIGZ1bmN0aW9uIG1ha2VSb3coc3RyLCBzaXplLCBjb2xvciwgZm9udFNwZWMsIHJlZkxheWVyLCBuYW1lLCBtZWFzdXJlVCkgew0KICAgICAgICB2YXIgdGwsIHRwLCBkb2MsIGFwcGxpZWQsIGdvdDsNCg0KICAgICAgICBpZiAocmVmTGF5ZXIpIHsNCiAgICAgICAgICAgIHRsID0gcmVmTGF5ZXIuZHVwbGljYXRlKCk7DQogICAgICAgICAgICB0bC5lbmFibGVkID0gdHJ1ZTsNCiAgICAgICAgICAgIHRwID0gdGwucHJvcGVydHkoIkFEQkUgVGV4dCBQcm9wZXJ0aWVzIikucHJvcGVydHkoIkFEQkUgVGV4dCBEb2N1bWVudCIpOw0KICAgICAgICAgICAgZG9jID0gdHAudmFsdWU7DQogICAgICAgICAgICBkb2MudGV4dCA9IHN0cjsNCiAgICAgICAgICAgIGRvYy5mb250U2l6ZSA9IHNpemU7DQogICAgICAgICAgICBkb2MuYXBwbHlGaWxsID0gdHJ1ZTsNCiAgICAgICAgICAgIGRvYy5maWxsQ29sb3IgPSBjb2xvcjsNCiAgICAgICAgICAgIGRvYy5qdXN0aWZpY2F0aW9uID0gUGFyYWdyYXBoSnVzdGlmaWNhdGlvbi5DRU5URVJfSlVTVElGWTsNCiAgICAgICAgICAgIHRwLnNldFZhbHVlKGRvYyk7ICAgICAgICAgICAgICAgICAgICAgICAvLyBmb250IHVudG91Y2hlZCAtPiBzdGF5cyByZXNvbHZlZA0KICAgICAgICAgICAgZ290ID0gU3RyaW5nKHRwLnZhbHVlLmZvbnRGYW1pbHkpICsgIiAvICIgKyBTdHJpbmcodHAudmFsdWUuZm9udFN0eWxlKTsNCiAgICAgICAgICAgIGFwcGxpZWQgPSB0cnVlOw0KICAgICAgICB9IGVsc2Ugew0KICAgICAgICAgICAgdGwgPSBjb21wLmxheWVycy5hZGRUZXh0KHN0cik7DQogICAgICAgICAgICB0cCA9IHRsLnByb3BlcnR5KCJBREJFIFRleHQgUHJvcGVydGllcyIpLnByb3BlcnR5KCJBREJFIFRleHQgRG9jdW1lbnQiKTsNCiAgICAgICAgICAgIHZhciB3YW50RiA9IFN0cmluZyhmb250U3BlYy5mYW1pbHkpOw0KICAgICAgICAgICAgdmFyIHdhbnRTID0gKGZvbnRTcGVjLnN0eWxlIHx8ICIiKTsNCiAgICAgICAgICAgIGZvciAodmFyIGEgPSAwOyBhIDwgNjsgYSsrKSB7DQogICAgICAgICAgICAgICAgZG9jID0gdHAudmFsdWU7DQogICAgICAgICAgICAgICAgZG9jLmZvbnRTaXplID0gc2l6ZTsgZG9jLmFwcGx5RmlsbCA9IHRydWU7IGRvYy5maWxsQ29sb3IgPSBjb2xvcjsNCiAgICAgICAgICAgICAgICBkb2MuanVzdGlmaWNhdGlvbiA9IFBhcmFncmFwaEp1c3RpZmljYXRpb24uQ0VOVEVSX0pVU1RJRlk7DQogICAgICAgICAgICAgICAgdHJ5IHsgZG9jLmZvbnRGYW1pbHkgPSB3YW50RjsgaWYgKHdhbnRTLmxlbmd0aCkgZG9jLmZvbnRTdHlsZSA9IHdhbnRTOyB9DQogICAgICAgICAgICAgICAgY2F0Y2ggKGUpIHsgdHJ5IHsgZG9jLmZvbnQgPSB3YW50RjsgfSBjYXRjaCAoZTIpIHt9IH0NCiAgICAgICAgICAgICAgICB0cC5zZXRWYWx1ZShkb2MpOw0KICAgICAgICAgICAgICAgIHZhciBva0YgPSAoU3RyaW5nKHRwLnZhbHVlLmZvbnRGYW1pbHkpID09PSB3YW50Rik7DQogICAgICAgICAgICAgICAgdmFyIG9rUyA9ICghd2FudFMubGVuZ3RoKSB8fCAoU3RyaW5nKHRwLnZhbHVlLmZvbnRTdHlsZSkgPT09IHdhbnRTKTsNCiAgICAgICAgICAgICAgICBpZiAob2tGICYmIG9rUykgYnJlYWs7ICAgICAgICAgICAgICAvLyB2ZXJpZnkgZmFtaWx5IEFORCBzdHlsZQ0KICAgICAgICAgICAgfQ0KICAgICAgICAgICAgZ290ID0gU3RyaW5nKHRwLnZhbHVlLmZvbnRGYW1pbHkpICsgIiAvICIgKyBTdHJpbmcodHAudmFsdWUuZm9udFN0eWxlKTsNCiAgICAgICAgICAgIGFwcGxpZWQgPSAoU3RyaW5nKHRwLnZhbHVlLmZvbnRGYW1pbHkpID09PSB3YW50RikgJiYNCiAgICAgICAgICAgICAgICAgICAgICAoIXdhbnRTLmxlbmd0aCB8fCBTdHJpbmcodHAudmFsdWUuZm9udFN0eWxlKSA9PT0gd2FudFMpOw0KICAgICAgICB9DQoNCiAgICAgICAgdGwubmFtZSA9IG5hbWU7DQogICAgICAgIHZhciByID0gdGwuc291cmNlUmVjdEF0VGltZShtZWFzdXJlVCwgZmFsc2UpOw0KICAgICAgICB0bC5wcm9wZXJ0eSgiQURCRSBUcmFuc2Zvcm0gR3JvdXAiKS5wcm9wZXJ0eSgiQURCRSBBbmNob3IgUG9pbnQiKQ0KICAgICAgICAgIC5zZXRWYWx1ZShbci5sZWZ0ICsgci53aWR0aCAvIDIsIHIudG9wICsgci5oZWlnaHQgLyAyXSk7DQogICAgICAgIHJldHVybiB7IGxheWVyOiB0bCwgaDogci5oZWlnaHQsIGFwcGxpZWQ6IGFwcGxpZWQsIGdvdDogZ290IH07DQogICAgfQ0KDQogICAgdmFyIHN0YXJ0cyA9IFtdOw0KICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2FyZHMubGVuZ3RoOyBpKyspIHN0YXJ0c1tpXSA9IHRjMnNlYyhjYXJkc1tpXS5zdGFydCk7DQoNCiAgICB2YXIgY3ggPSBjb21wLndpZHRoIC8gMiwgY3kgPSBjb21wLmhlaWdodCAqIFlfQU5DSE9SOw0KICAgIGFwcC5iZWdpblVuZG9Hcm91cCgiQnVpbGQgQ2FwdGlvbnMiKTsNCiAgICB2YXIgZmFpbGVkRm9udHMgPSAwLCBsb2dMaW5lcyA9IFtdOw0KDQogICAgZm9yICh2YXIgYyA9IDA7IGMgPCBjYXJkcy5sZW5ndGg7IGMrKykgew0KICAgICAgICB2YXIgY2FyZCA9IGNhcmRzW2NdOw0KDQogICAgICAgIHZhciBmYkluID0gdGMyc2VjKGNhcmQuc3RhcnQpOw0KICAgICAgICB2YXIgZW5kU2VjID0gaGFzKGNhcmQuZW5kKSA/IHRjMnNlYyhjYXJkLmVuZCkgOiBmYkluICsgMC41Ow0KICAgICAgICB2YXIgbmV4dFN0YXJ0ID0gKGMgPCBjYXJkcy5sZW5ndGggLSAxKSA/IHN0YXJ0c1tjICsgMV0gOiBudWxsOw0KICAgICAgICB2YXIgZmJPdXQ7DQogICAgICAgIGlmIChIT0xEX1RPX05FWFQpIHsNCiAgICAgICAgICAgIGZiT3V0ID0gKG5leHRTdGFydCAhPSBudWxsKSA/IG5leHRTdGFydCA6IGVuZFNlYzsNCiAgICAgICAgICAgIGlmIChNQVhfSE9MRCA+IDApIGZiT3V0ID0gTWF0aC5taW4oZmJPdXQsIGVuZFNlYyArIE1BWF9IT0xEKTsNCiAgICAgICAgfSBlbHNlIHsNCiAgICAgICAgICAgIGZiT3V0ID0gZW5kU2VjICsgVEFJTF9QQUQ7DQogICAgICAgICAgICBpZiAobmV4dFN0YXJ0ICE9IG51bGwpIGZiT3V0ID0gTWF0aC5taW4oZmJPdXQsIG5leHRTdGFydCk7DQogICAgICAgIH0NCg0KICAgICAgICB2YXIgdG9wID0gcGFyc2VGaWVsZChjYXJkLnNtYWxsX3RvcCwgICAgZmJJbiwgZmJPdXQpOw0KICAgICAgICB2YXIgaGxyID0gcGFyc2VGaWVsZChjYXJkLmhpZ2hsaWdodCwgICAgZmJJbiwgZmJPdXQpOw0KICAgICAgICB2YXIgYm90ID0gcGFyc2VGaWVsZChjYXJkLnNtYWxsX2JvdHRvbSwgZmJJbiwgZmJPdXQpOw0KICAgICAgICB2YXIgbGVhZHMgPSAhdG9wOw0KDQogICAgICAgIHZhciByb3dzID0gW107DQogICAgICAgIGZ1bmN0aW9uIHB1c2hSb3coZGVmLCBzaXplLCBjb2xvciwgZm9udFNwZWMsIHJlZkxheWVyLCBzdWZmaXgsIGlzSEwsIGxlYWRGbGFnKSB7DQogICAgICAgICAgICBpZiAoIWRlZikgcmV0dXJuOw0KICAgICAgICAgICAgdmFyIHMgPSBpc0hMID8gcmVjYXNlSEwoZGVmLnRleHQsIGxlYWRGbGFnKSA6IHJlY2FzZVNNKGRlZi50ZXh0KTsNCiAgICAgICAgICAgIHZhciBtID0gbWFrZVJvdyhzLCBzaXplLCBjb2xvciwgZm9udFNwZWMsIHJlZkxheWVyLCAiQyIgKyBjYXJkLmlkICsgc3VmZml4LCBkZWYuaW5TZWMpOw0KICAgICAgICAgICAgbS5pblNlYyA9IGRlZi5pblNlYzsgbS5vdXRTZWMgPSBkZWYub3V0U2VjOw0KICAgICAgICAgICAgcm93cy5wdXNoKG0pOw0KICAgICAgICB9DQogICAgICAgIHB1c2hSb3codG9wLCBTSVpFX1NNLCBDT0xPUl9TTSwgRk9OVF9TTSwgcmVmU00sICJfVE9QIiwgZmFsc2UsIGZhbHNlKTsNCiAgICAgICAgcHVzaFJvdyhobHIsIFNJWkVfSEwsIENPTE9SX0hMLCBGT05UX0hMLCByZWZITCwgIl9ITCIsICB0cnVlLCAgbGVhZHMpOw0KICAgICAgICBwdXNoUm93KGJvdCwgU0laRV9TTSwgQ09MT1JfU00sIEZPTlRfU00sIHJlZlNNLCAiX0JPVCIsIGZhbHNlLCBmYWxzZSk7DQogICAgICAgIGlmICghcm93cy5sZW5ndGgpIGNvbnRpbnVlOw0KDQogICAgICAgIHZhciB0b3RhbEggPSAwOw0KICAgICAgICBmb3IgKHZhciBrID0gMDsgayA8IHJvd3MubGVuZ3RoOyBrKyspIHRvdGFsSCArPSByb3dzW2tdLmg7DQogICAgICAgIHRvdGFsSCArPSBST1dfR0FQICogKHJvd3MubGVuZ3RoIC0gMSk7DQoNCiAgICAgICAgdmFyIHlDdXJzb3IgPSBjeSAtIHRvdGFsSCAvIDI7DQogICAgICAgIGZvciAodmFyIGsyID0gMDsgazIgPCByb3dzLmxlbmd0aDsgazIrKykgew0KICAgICAgICAgICAgdmFyIGggPSByb3dzW2syXS5oOw0KICAgICAgICAgICAgcm93c1trMl0ubGF5ZXIucHJvcGVydHkoIkFEQkUgVHJhbnNmb3JtIEdyb3VwIikucHJvcGVydHkoIkFEQkUgUG9zaXRpb24iKQ0KICAgICAgICAgICAgICAgICAgICAuc2V0VmFsdWUoW2N4LCB5Q3Vyc29yICsgaCAvIDJdKTsNCiAgICAgICAgICAgIHZhciBpblMgPSByb3dzW2syXS5pblNlYywgb3V0UyA9IHJvd3NbazJdLm91dFNlYzsNCiAgICAgICAgICAgIGlmIChvdXRTIDw9IGluUykgb3V0UyA9IGluUyArIDAuMTsNCiAgICAgICAgICAgIGlmIChvdXRTID4gY29tcC5kdXJhdGlvbikgb3V0UyA9IGNvbXAuZHVyYXRpb247DQogICAgICAgICAgICByb3dzW2syXS5sYXllci5pblBvaW50ICA9IGluUzsNCiAgICAgICAgICAgIHJvd3NbazJdLmxheWVyLm91dFBvaW50ID0gb3V0UzsNCiAgICAgICAgICAgIHlDdXJzb3IgKz0gaCArIFJPV19HQVA7DQogICAgICAgICAgICBpZiAoIXJvd3NbazJdLmFwcGxpZWQpIGZhaWxlZEZvbnRzKys7DQogICAgICAgIH0NCg0KICAgICAgICBpZiAoTE9HX0ZPTlRTKSB7DQogICAgICAgICAgICBmb3IgKHZhciBrMyA9IDA7IGszIDwgcm93cy5sZW5ndGg7IGszKyspDQogICAgICAgICAgICAgICAgbG9nTGluZXMucHVzaChyb3dzW2szXS5sYXllci5uYW1lICsgIiAgLT4gICIgKyByb3dzW2szXS5nb3QgKyAiICAob2s6ICIgKyByb3dzW2szXS5hcHBsaWVkICsgIikiKTsNCiAgICAgICAgICAgIGZvciAodmFyIGQgPSAwOyBkIDwgdXNlZFJlZnMubGVuZ3RoOyBkKyspIHVzZWRSZWZzW2RdLmVuYWJsZWQgPSBmYWxzZTsNCiAgICAgICAgICAgIGFwcC5lbmRVbmRvR3JvdXAoKTsNCiAgICAgICAgICAgIGFsZXJ0KCJMT0dfRk9OVFMgLS0gY2FyZCAiICsgY2FyZC5pZCArICI6XG5cbiIgKyBsb2dMaW5lcy5qb2luKCJcbiIpICsgIlxuXG4oU3RvcHBlZC4gU2V0IExPR19GT05UUz1mYWxzZSB0byBidWlsZCBhbGwuKSIpOw0KICAgICAgICAgICAgcmV0dXJuOw0KICAgICAgICB9DQogICAgfQ0KDQogICAgLy8gaGlkZSB0aGUgcmVmZXJlbmNlIGxheWVycyBzbyB0aGV5IGRvbid0IHJlbmRlcg0KICAgIGZvciAodmFyIGQyID0gMDsgZDIgPCB1c2VkUmVmcy5sZW5ndGg7IGQyKyspIHVzZWRSZWZzW2QyXS5lbmFibGVkID0gZmFsc2U7DQoNCiAgICBhcHAuZW5kVW5kb0dyb3VwKCk7DQogICAgdmFyIG1zZyA9ICJCdWlsdCAiICsgY2FyZHMubGVuZ3RoICsgIiBjYXB0aW9uIGNhcmRzIChwZXItcm93IHRpbWVkKS4iOw0KICAgIGlmICghcmVmSEwgfHwgIXJlZlNNKSB7DQogICAgICAgIG1zZyArPSAiXG5cbk5PVEU6ICIgKyAoIXJlZkhMID8gIlJFRl9ITCAiIDogIiIpICsgKCFyZWZTTSA/ICJSRUZfU00gIiA6ICIiKSArDQogICAgICAgICAgICAgICAibm90IGZvdW5kIC0tIHRob3NlIHJvd3MgdXNlZCBuYW1lLWJhc2VkIGZvbnRzIChtYXkgc3Vic3RpdHV0ZSkuICIgKw0KICAgICAgICAgICAgICAgIk1ha2UgdGhlIG1pc3NpbmcgcmVmZXJlbmNlIGxheWVyKHMpIGFuZCByZS1ydW4uIjsNCiAgICB9DQogICAgaWYgKGZhaWxlZEZvbnRzKSBtc2cgKz0gIlxuXG4iICsgZmFpbGVkRm9udHMgKyAiIGxheWVyKHMpIGRpZG4ndCBjb25maXJtIHRoZSByZXF1ZXN0ZWQgZm9udC4iOw0KICAgIGFsZXJ0KG1zZyk7DQp9KSgpOw==";
function b64decode(s) {
  try {
    return decodeURIComponent(Array.prototype.map.call(atob(s),
      (c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join(""));
  } catch (e) { try { return atob(s); } catch (e2) { return ""; } }
}
const CAPTION_BUILDER = b64decode(CAPTION_BUILDER_B64);

// ---------------------------------------------------------- text helpers ---
const STOP = {};
("a an the and or but so to of in on at for with from by as is are was were be been being it its " +
 "this that these those i you he she we they them his her our your my me us do does did have has had " +
 "will would can could should just then than into over out up down if not no yes about")
  .split(" ").forEach((w) => (STOP[w] = 1));
const MAG = {};
"trillion billion million thousand hundred percent k m b grand".split(" ").forEach((w) => (MAG[w] = 1));
// discourse / filler / auxiliary words: real words, but almost never the punch
// word a caption should emphasise. Down-weighted so content words win.
const DOWN = {};
("because so just then when while used gonna wanna really very actually basically literally " +
 "maybe well also even still kind sort like okay yeah right look mean know guys " +
 "cant dont wont isnt didnt doesnt couldnt wouldnt shouldnt wasnt arent werent havent")
  .split(" ").forEach((w) => (DOWN[w] = 1));

const core = (t) => String(t == null ? "" : t).replace(/^["“‘(]+/, "").replace(/["”’).,!?;:]+$/, "");
const endsSentence = (t) => /[.!?]+["”’)]?$/.test(t);
const endsComma = (t) => /,["”’)]?$/.test(t);
const fragLen = (ws) => ws.map((w) => core(w.text)).join(" ").length;

function pad(n, w) { n = String(n); while (n.length < w) n = "0" + n; return n; }
function tc(secs) {
  if (secs < 0) secs = 0;
  let ms = Math.round(secs * 1000);
  const h = Math.floor(ms / 3600000); ms -= h * 3600000;
  const m = Math.floor(ms / 60000); ms -= m * 60000;
  const s = Math.floor(ms / 1000); ms -= s * 1000;
  return pad(h, 2) + ":" + pad(m, 2) + ":" + pad(s, 2) + "," + pad(ms, 3);
}
const shortT = (s) => (s == null ? "—" : s.toFixed(2) + "s");
const clock = (s) => {
  if (s == null || isNaN(s)) return "0:00";
  s = Math.max(0, s);
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return m + ":" + pad(r, 2);
};

// ----------------------------------------------------- prosody / breaths ---
// Spoken emphasis leaves fingerprints in the timing: emphasised words are drawn
// out (longer per character) and are often set off by a pause. This computes a
// per-word "emph" score (~0..25) from word durations and the gaps around them,
// stored on each word atom so the highlight picker can use it.
function computeEmphasis(words) {
  if (!words || !words.length) return words || [];
  const dpcs = [];
  for (const w of words) {
    const len = Math.max(1, core(w.text).length);
    const dur = Math.max(0, (w.end || 0) - (w.start || 0));
    if (dur > 0 && !STOP[core(w.text).toLowerCase()]) dpcs.push(dur / len);
  }
  dpcs.sort((a, b) => a - b);
  const base = dpcs.length ? dpcs[Math.floor(dpcs.length / 2)] : 0.06;
  const PAUSE = 0.22;
  return words.map((w, i) => {
    const len = Math.max(1, core(w.text).length);
    const dur = Math.max(0, (w.end || 0) - (w.start || 0));
    const durTerm = base > 0 ? Math.max(0, Math.min(1, dur / len / base - 1)) : 0;
    const prev = i > 0 ? words[i - 1] : null, next = i < words.length - 1 ? words[i + 1] : null;
    const gapAfter = next ? Math.max(0, (next.start || 0) - (w.end || 0)) : PAUSE;
    const gapBefore = prev ? Math.max(0, (w.start || 0) - (prev.end || 0)) : 0;
    const emph = 12 * durTerm + 9 * Math.min(1, gapAfter / PAUSE) + 4 * Math.min(1, gapBefore / PAUSE);
    return { ...w, emph: Math.round(emph * 10) / 10 };
  });
}

// ------------------------------------------------------------- highlight ---
function scoreWord(w, sentenceStart) {
  const tok = core(w.text), low = tok.toLowerCase();
  let sc = 0;
  if (/[\d$£€%]/.test(tok)) sc += 100;
  else if (/^[A-Z]/.test(tok) && tok.length > 1 && !sentenceStart) sc += 45;
  if (!STOP[low]) sc += 10;
  if (DOWN[low] || DOWN[low.replace(/['’‘]/g, "")]) sc -= 14;
  sc += Math.min(tok.length, 12);
  if (tok.length > 12) sc -= 5;
  sc += (w.emph || 0);                 // prosodic emphasis from breath analysis
  return sc;
}
function pickHighlight(span, flags) {
  const scores = span.map((w, i) => scoreWord(w, flags[i]));
  let best = 0;
  for (let i = 1; i < span.length; i++) if (scores[i] > scores[best]) best = i;
  // on a genuine tie, prefer the phrase-final word (cleaner 2-row, matches the
  // way emphasis usually lands at the end of a beat)
  const last = span.length - 1;
  if (best !== last && scores[last] === scores[best]) best = last;
  let hj = best;
  if (best + 1 < span.length) {
    const here = core(span[best].text), next = core(span[best + 1].text).toLowerCase();
    if (/[\d$£€]/.test(here) && (MAG[next] || /^[\d.,]+$/.test(next))) hj = best + 1;
  }
  return { hi: best, hj };
}

// --------------------------------------------------------------- ingest ----
function flattenTranscript(raw) {
  const words = [];
  const segs = raw.segments || [];
  for (let s = 0; s < segs.length; s++) {
    const seg = segs[s], ws = seg.words || [];
    if (!ws.length) continue;
    const relative = ws[0].start != null && seg.start != null && ws[0].start < seg.start - 0.001;
    const off = relative ? seg.start || 0 : 0;
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      const start = (w.start || 0) + off;
      let end;
      if (w.duration != null) end = start + w.duration;
      else if (i + 1 < ws.length) end = (ws[i + 1].start || 0) + off;
      else end = start + 0.3;
      words.push({ text: String(w.text == null ? "" : w.text), start, end, eos: !!w.eos, seg: s });
    }
  }
  for (let k = 0; k < words.length; k++) {
    words[k].id = "w" + pad(k + 1, 4);
    const prev = k > 0 ? words[k - 1] : null;
    words[k].sentenceStart = !prev || prev.eos || endsSentence(prev.text);
  }
  return computeEmphasis(words);
}

function rePickFor(wordIds, wordById, interiorMargin) {  const span = wordIds.map((id) => wordById[id]);
  const flags = span.map((w) => w.sentenceStart);
  const { hi, hj } = pickHighlight(span, flags, interiorMargin);
  return { hlFrom: hi, hlTo: hj };
}

// Cards carry a sequential id used for the C#_TOP / C#_HL / C#_BOT layer names,
// so any structural change renumbers them 1..n in order.
const renumber = (cs) => cs.map((c, i) => ({ ...c, id: i + 1 }));

// Number of rendered rows for a card: small_top? + highlight + small_bottom?
function cardRowCount(card) {
  const before = card.hlFrom;                       // words above the highlight
  const after = card.wordIds.length - 1 - card.hlTo; // words below it
  return 1 + (before > 0 ? 1 : 0) + (after > 0 ? 1 : 0);
}

// Lone-word cards (a single highlighted word, no context line) read badly, so
// any 1-row card is merged into a neighbour (previous preferred) and the
// highlight re-picked.
function mergeLoneCards(cards, words) {
  const byId = {}; for (const w of words) byId[w.id] = w;
  let cs = cards.map((c) => ({ ...c }));
  let changed = true, guard = 0;
  while (changed && guard++ < cards.length + 8) {
    changed = false;
    for (let k = 0; k < cs.length; k++) {
      if (cardRowCount(cs[k]) > 1 || cs.length === 1) continue;
      const into = k > 0 ? k - 1 : k + 1;             // glue onto previous, else next
      const lo = Math.min(into, k), hi = Math.max(into, k);
      const ids = cs[lo].wordIds.concat(cs[hi].wordIds);
      const merged = { id: 0, wordIds: ids, ...rePickFor(ids, byId, 40) };
      cs = cs.slice(0, lo).concat([merged], cs.slice(hi + 1));
      changed = true; break;
    }
  }
  return cs.map((c, i) => ({ ...c, id: i + 1 }));
}

function seedCards(words, cfg) {
  const INTERIOR = 40;
  const lim = cfg.smallMaxChars;
  const prefer2 = cfg.prefer2Row !== false;

  // --- breath segmentation (unchanged) ---
  const breaths = [];
  let cur = [];
  for (let k = 0; k < words.length; k++) {
    const word = words[k];
    if (cur.length) {
      const prev = words[cur[cur.length - 1]];
      const brk = prev.eos || endsComma(prev.text) ||
        word.start - prev.end >= cfg.breathGap || word.seg !== prev.seg;
      if (brk) { breaths.push(cur); cur = []; }
    }
    cur.push(k);
  }
  if (cur.length) breaths.push(cur);

  // Evaluate one candidate span: where the highlight lands decides the layout.
  // Highlight at an edge -> 2 rows (one small line). Highlight interior -> 3.
  const layoutOf = (spanIdx) => {
    const span = spanIdx.map((i) => words[i]);
    const flags = span.map((w) => w.sentenceStart);
    const { hi, hj } = pickHighlight(span, flags, INTERIOR);
    const top = span.slice(0, hi), bot = span.slice(hj + 1);
    const rows = 1 + (top.length ? 1 : 0) + (bot.length ? 1 : 0);
    const fits = (!top.length || fragLen(top) <= lim) && (!bot.length || fragLen(bot) <= lim);
    const overflow = (top.length ? Math.max(0, fragLen(top) - lim) : 0) +
                     (bot.length ? Math.max(0, fragLen(bot) - lim) : 0);
    let hlScore = -1;
    for (let x = hi; x <= hj; x++) hlScore = Math.max(hlScore, scoreWord(span[x], flags[x]));
    return { hi, hj, rows, fits, overflow, hlScore };
  };

  // Rank candidates: a fitting 2-row wins (when prefer2), then 3-row, then by
  // larger size (fewer cards), stronger highlight, less overflow. A 1-row
  // (lone) layout is always last and only used when nothing else is available.
  const rank = (c) => {
    if (!c.fits) return c.rows === 1 ? 0 : 1;
    if (c.rows === 1) return 2;
    if (c.rows === 2) return prefer2 ? 5 : 4;
    if (c.rows === 3) return 4;
    return 3;
  };
  const better = (a, b) => {
    if (!a) return b; if (!b) return a;
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra > rb ? a : b;
    if (a.size !== b.size) return a.size > b.size ? a : b;
    if (a.hlScore !== b.hlScore) return a.hlScore > b.hlScore ? a : b;
    return a.overflow <= b.overflow ? a : b;
  };

  const cards = [];
  let cid = 1;
  const emit = (spanIdx, L) => cards.push({ id: cid++, wordIds: spanIdx.map((k) => words[k].id), hlFrom: L.hi, hlTo: L.hj });
  // the small-line char limit is the real bound; allow generous word counts so a
  // whole breath-phrase can stay together (8-word safety cap)
  const CAP = Math.max(cfg.cardMaxWords, 8);

  for (const breath of breaths) {
    // 1) keep the whole breath-phrase as ONE card when it fits as a clean
    //    caption (2 rows preferred, 3 if a centred highlight needs it). This is
    //    what keeps "it can't be that good" and "from 196 to 174" intact.
    if (breath.length <= CAP) {
      const L = layoutOf(breath);
      if (L.fits && L.rows >= 2) { emit(breath, L); continue; }
    }
    // 2) otherwise the phrase is too long for one card — pack it greedily,
    //    2-row-first, bounded by the character limit rather than a word count.
    let i = 0;
    while (i < breath.length) {
      const rem = breath.length - i;
      const maxSize = Math.min(CAP, rem);
      const lo = rem === 1 ? 1 : 2;            // never start a card as a lone word
      let best = null;
      for (let size = lo; size <= maxSize; size++) {
        const spanIdx = breath.slice(i, i + size);
        best = better(best, { ...layoutOf(spanIdx), size, spanIdx });
      }
      if (!best) { const spanIdx = breath.slice(i, i + 1); best = { ...layoutOf(spanIdx), size: 1, spanIdx }; }
      emit(best.spanIdx, best);
      i += best.size;
    }
  }

  // sweep up any remaining lone cards (e.g. a one-word breath)
  return mergeLoneCards(cards, words);
}

// --------------------------------------------------------------- derive ----
function deriveTiming(cards, wordById, tailPad) {
  const rows = cards.map((card) => card.wordIds.map((id) => wordById[id]));
  return cards.map((card, c) => {
    const ws = rows[c];
    const first = ws[0], last = ws[ws.length - 1];
    let outSec = last.end + tailPad;
    if (c + 1 < cards.length) {
      const nx = rows[c + 1][0];
      if (nx.start < outSec) outSec = nx.start;
    }
    const top = ws.slice(0, card.hlFrom);
    const hl = ws.slice(card.hlFrom, card.hlTo + 1);
    const bot = ws.slice(card.hlTo + 1);
    return {
      inSec: first.start, outSec, spokenEnd: last.end, top, hl, bot,
      topIn: top.length ? top[0].start : null,
      hlIn: hl[0].start,
      botIn: bot.length ? bot[0].start : null,
      topOver: top.length ? fragLen(top) > 18 : false,
      botOver: bot.length ? fragLen(bot) > 18 : false,
    };
  });
}

// ----------------------------------------------------------- NW alignment --
// The script is written in prose, but the transcript times every spoken word
// separately. So a compound the writer hyphenated ("full-time", "blood-work",
// "45-minute") is ONE script token but TWO+ transcript words. Aligning them
// 1:1 forces a bogus "mismatch". Splitting compound script tokens on hyphens
// and slashes makes them line up word-for-word with the transcript, so these
// stop being flagged at all.
function tokenizeScript(scriptText) {
  const out = [];
  for (const chunk of scriptText.trim().split(/\s+/)) {
    if (!chunk) continue;
    const cleaned = core(chunk);
    const parts = cleaned.split(/[-\u2010-\u2015/]+/).filter(Boolean);
    const list = parts.length ? parts : [cleaned];
    for (const p of list) if (p) out.push({ raw: p, norm: p.toLowerCase() });
  }
  return out;
}

// --- spelling similarity: tells a real misspelling ("refine"->"refund") from a
// genuinely different word the transcriber misheard ("afternoon"->"optimal").
// Only the close ones are safe to auto-apply.
function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}
const normWord = (s) => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, "");
function isCloseSpelling(aWord, bTok) {
  const a = normWord(aWord), b = normWord(bTok);
  if (!a || !b) return false;
  if (a === b) return true;
  // plural/tense/contraction variants: one stems the other
  if ((a.startsWith(b) || b.startsWith(a)) && Math.abs(a.length - b.length) <= 3) return true;
  const ml = Math.max(a.length, b.length);
  return lev(a, b) <= Math.max(1, Math.round(ml * 0.3));
}

function alignScript(words, scriptText) {
  const tokens = tokenizeScript(scriptText);
  const a = words.map((w) => core(w.text).toLowerCase());
  const b = tokens.map((t) => t.norm);
  const n = a.length, m = b.length;
  if (!n || !m) return { ops: [], tokens };
  const MATCH = 2, MIS = -1, GAP = -2;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) dp[i][0] = i * GAP;
  for (let j = 1; j <= m; j++) dp[0][j] = j * GAP;
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) {
      const sc = a[i - 1] === b[j - 1] ? MATCH : MIS;
      dp[i][j] = Math.max(dp[i - 1][j - 1] + sc, dp[i - 1][j] + GAP, dp[i][j - 1] + GAP);
    }
  const ops = []; let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? MATCH : MIS)) {
      ops.push({ type: a[i - 1] === b[j - 1] ? "match" : "sub", t: i - 1, s: j - 1 }); i--; j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + GAP) {
      ops.push({ type: "del", t: i - 1, s: null }); i--;
    } else { ops.push({ type: "ins", t: null, s: j - 1 }); j--; }
  }
  ops.reverse();
  return { ops, tokens };
}

// Build the per-word script lane used by both the timeline and the QC panel.
function buildScriptLane(alignment) {
  if (!alignment || !alignment.ops.length) return null;
  const byWord = {};       // transcript index -> { type:'match'|'sub'|'del', token? }
  const insBefore = {};    // transcript index (or 'end') -> [script tokens with no transcript home]
  let pending = [];
  for (const op of alignment.ops) {
    if (op.type === "ins") { pending.push(alignment.tokens[op.s].raw); continue; }
    if (pending.length) { insBefore[op.t] = pending; pending = []; }
    if (op.type === "match" || op.type === "sub") byWord[op.t] = { type: op.type, token: alignment.tokens[op.s].raw };
    else byWord[op.t] = { type: "del" };
  }
  if (pending.length) insBefore.end = pending;
  return { byWord, insBefore };
}

// --------------------------------------------------------------- export ----
function buildCaptionsJSON(cards, derived) {
  return cards.map((card, n) => {
    const d = derived[n];
    const nRows = 1 + (d.top.length ? 1 : 0) + (d.bot.length ? 1 : 0);
    const topTxt = d.top.map((w) => core(w.text)).join(" ").toLowerCase();
    const hlTxt = d.hl.map((w) => core(w.text)).join(" ").toUpperCase();
    const botTxt = d.bot.map((w) => core(w.text)).join(" ").toLowerCase();
    const outTc = tc(d.outSec);
    const row = (txt, inSec) => (txt ? { text: txt, in: tc(inSec), out: outTc } : { text: "", in: "", out: "" });
    return {
      id: n + 1, start: tc(d.inSec), end: outTc, rows: nRows,
      small_top: row(topTxt, d.topIn),
      highlight: row(hlTxt, d.hlIn),
      small_bottom: row(botTxt, d.botIn),
    };
  });
}

function download(name, data) {
  const blob = new Blob([typeof data === "string" ? data : JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ============================================================== audio hook ===
// One hidden <audio> drives playback; the decoded mono channel drives the
// waveform. Segment playback (a word, a card) seeks then auto-stops at `segEnd`.
function useAudio() {
  const elRef = useRef(null);
  const ctxRef = useRef(null);
  const segEnd = useRef(null);
  const raf = useRef(0);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [channel, setChannel] = useState(null);   // Float32Array, mono mix
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [decoding, setDecoding] = useState(false);
  const [err, setErr] = useState("");

  // Listeners attach to the <audio> element the component renders (elRef). A
  // real in-DOM element plays reliably inside sandboxed iframes, unlike a
  // detached `new Audio()`.
  useEffect(() => {
    const a = elRef.current;
    if (!a) return;
    const onMeta = () => setDuration((d) => (isFinite(a.duration) ? a.duration : d));
    const onEnd = () => { setPlaying(false); segEnd.current = null; };
    const onErr = () => setErr("The browser couldn't load this audio file. Try a .wav, .mp3, or .m4a export.");
    const onPlay = () => { setErr(""); setPlaying(true); };
    const onPause = () => setPlaying(false);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);
    a.addEventListener("error", onErr);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    return () => {
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("error", onErr);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
    };
  }, []);

  // rAF clock: drives the playhead + enforces segment stop.
  useEffect(() => {
    if (!playing) { cancelAnimationFrame(raf.current); return; }
    const tick = () => {
      const a = elRef.current;
      if (!a) return;
      const t = a.currentTime;
      if (segEnd.current != null && t >= segEnd.current) {
        a.pause(); segEnd.current = null; setPlaying(false); setTime(t); return;
      }
      setTime(t);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);

  const load = useCallback(async (file) => {
    if (!file) return;
    const objUrl = URL.createObjectURL(file);
    setUrl((old) => { if (old) setTimeout(() => URL.revokeObjectURL(old), 500); return objUrl; });
    setName(file.name); setTime(0); setChannel(null);
    setDecoding(true);
    try {
      const buf = await file.arrayBuffer();
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = ctxRef.current || new Ctx();
      ctxRef.current = ctx;
      const audioBuf = await ctx.decodeAudioData(buf.slice(0));
      const n = audioBuf.length;
      const chs = [];
      for (let c = 0; c < audioBuf.numberOfChannels; c++) chs.push(audioBuf.getChannelData(c));
      let mono = chs[0];
      if (chs.length > 1) {
        mono = new Float32Array(n);
        for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < chs.length; c++) s += chs[c][i]; mono[i] = s / chs.length; }
      }
      setChannel(mono);
      setDuration(audioBuf.duration);
    } catch (e) {
      // playback still works via <audio>; just no waveform.
      setChannel(null);
    } finally { setDecoding(false); }
  }, []);

  const tryPlay = useCallback((a) => {
    const p = a.play();
    if (p && p.catch) p.then(() => setErr("")).catch((e) => {
      setErr(e && e.name === "NotAllowedError"
        ? "Playback was blocked. Click play once more to allow audio."
        : "Couldn't start playback: " + (e && e.message ? e.message : "unknown error"));
      setPlaying(false);
    });
  }, []);

  const play = useCallback(() => { const a = elRef.current; if (!a || !url) return; segEnd.current = null; tryPlay(a); }, [url, tryPlay]);
  const pause = useCallback(() => { const a = elRef.current; if (!a) return; a.pause(); segEnd.current = null; setPlaying(false); }, []);
  const toggle = useCallback(() => {
    const a = elRef.current; if (!a || !url) return;
    if (a.paused) { segEnd.current = null; tryPlay(a); } else { a.pause(); setPlaying(false); }
  }, [url, tryPlay]);
  const seek = useCallback((t) => { const a = elRef.current; if (!a) return; a.currentTime = Math.max(0, t); setTime(a.currentTime); }, []);
  const playRange = useCallback((s, e) => {
    const a = elRef.current; if (!a || !url) return;
    a.currentTime = Math.max(0, s); segEnd.current = e != null ? e + 0.04 : null;
    tryPlay(a);
  }, [url, tryPlay]);

  return { elRef, url, name, channel, duration, playing, time, decoding, err, load, play, pause, toggle, seek, playRange };
}

// find the word whose [start,end) contains t (fallback: last word that started)
function findActiveWord(words, t) {
  if (!words.length) return null;
  let lo = 0, hi = words.length - 1, hit = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].start <= t) { hit = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (hit < 0) return null;
  const w = words[hit];
  return t <= w.end + 0.05 ? w.id : null;
}

// ====================================================== preview component ===
function sentence(s) {
  s = s.toLowerCase();
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
function CardPreview({ d }) {
  const hlTxt = sentence(d.hl.map((w) => core(w.text)).join(" "));
  const topTxt = d.top.map((w) => core(w.text)).join(" ").toLowerCase();
  const botTxt = d.bot.map((w) => core(w.text)).join(" ").toLowerCase();
  return (
    <div className="cap-preview">
      {topTxt && <div className="pv-sm">{topTxt}</div>}
      <div className="pv-hl">{hlTxt}</div>
      {botTxt && <div className="pv-sm">{botTxt}</div>}
    </div>
  );
}

// ============================================================== waveform =====
const WaveCanvas = React.memo(function WaveCanvas({ channel, width, height, t0, t1 }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (!channel || !channel.length) return;
    const mid = height / 2;
    const span = Math.max(0.0001, t1 - t0);
    // samples per second = channel.length / audioDuration; here t1>=duration so
    // map x -> time -> sample index for correct alignment with word blocks.
    const sampleRate = channel.length / span; // approx samples per second over window
    ctx.fillStyle = C.wave;
    for (let x = 0; x < width; x++) {
      const ta = t0 + (x / width) * span;
      const tb = t0 + ((x + 1) / width) * span;
      let s = Math.floor(ta * sampleRate), e = Math.floor(tb * sampleRate);
      if (e <= s) e = s + 1;
      if (s < 0) s = 0; if (e > channel.length) e = channel.length;
      let mn = 1, mx = -1;
      for (let i = s; i < e; i += 1) { const v = channel[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
      if (mn > mx) { mn = 0; mx = 0; }
      const y1 = mid + mn * mid * 0.94;
      const y2 = mid + mx * mid * 0.94;
      ctx.fillRect(x, y1, 1, Math.max(1, y2 - y1));
    }
  }, [channel, width, height, t0, t1]);
  return <canvas ref={ref} className="tl-wave-canvas" />;
});

// ============================================================== timeline =====
const LANES = { ruler: 20, wave: 58, words: 44, script: 26 };
const TL_H = LANES.ruler + LANES.wave + LANES.words + LANES.script;

function rulerStep(pps) {
  const cands = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  for (const c of cands) if (c * pps >= 66) return c;
  return 600;
}

// Heavy, time-independent layers. Memoized so the playhead can animate at 60fps
// without re-rendering the waveform / blocks / script.
const TimelineTrack = React.memo(function TimelineTrack({
  words, cards, derived, wordById, channel, pps, t0, t1, totalW, lane,
}) {
  const step = rulerStep(pps);
  const ticks = [];
  for (let t = Math.ceil(t0 / step) * step; t <= t1 + 0.001; t += step) ticks.push(t);
  const x = (t) => (t - t0) * pps;

  // card index per word id (for colouring + grouping)
  const cardOf = {};
  cards.forEach((c, ci) => c.wordIds.forEach((id) => { cardOf[id] = ci; }));

  return (
    <div style={{ position: "absolute", inset: 0, width: totalW }}>
      {/* ruler */}
      <div className="tl-ruler" style={{ height: LANES.ruler }}>
        {ticks.map((t, i) => (
          <div key={i} className="tl-tick" style={{ left: x(t) }}>
            <span className="mono tl-tick-label">{clock(t)}</span>
          </div>
        ))}
      </div>

      {/* waveform */}
      <div className="tl-wave" style={{ height: LANES.wave }}>
        {channel
          ? <WaveCanvas channel={channel} width={totalW} height={LANES.wave} t0={t0} t1={t1} />
          : <div className="tl-wave-empty mono">load audio for waveform</div>}
        <div className="tl-wave-mid" />
      </div>

      {/* word blocks */}
      <div className="tl-words" style={{ height: LANES.words }}>
        {cards.map((card, ci) => {
          const d = derived[ci];
          const ws = card.wordIds.map((id) => wordById[id]);
          const left = x(ws[0].start);
          const right = x(ws[ws.length - 1].end);
          return (
            <React.Fragment key={card.id}>
              {/* card bracket */}
              <div className="tl-card-span" style={{ left, width: Math.max(2, right - left) }}>
                <span className="mono tl-card-id">C{card.id}</span>
              </div>
              {ws.map((w, local) => {
                const role = local < card.hlFrom ? "top" : local <= card.hlTo ? "hl" : "bot";
                const bl = x(w.start), bw = Math.max(3, x(w.end) - bl);
                return (
                  <div key={w.id} data-wid={w.id}
                    className={"tl-blk tl-blk-" + role + (ci % 2 ? " alt" : "")}
                    style={{ left: bl, width: bw }} title={core(w.text)}>
                    {bw > 26 && <span className="tl-blk-t">{core(w.text)}</span>}
                  </div>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>

      {/* script lane */}
      <div className="tl-script" style={{ height: LANES.script }}>
        {lane
          ? words.map((w, gi) => {
              const cell = lane.byWord[gi];
              const ins = lane.insBefore[gi];
              const bl = x(w.start), bw = Math.max(3, x(w.end) - bl);
              return (
                <React.Fragment key={w.id}>
                  {ins && (
                    <div className="tl-ins" style={{ left: bl }} title={"missing from transcript: " + ins.join(" ")}>
                      <span className="tl-ins-mark">＋</span>
                    </div>
                  )}
                  {cell && (
                    <div className={"tl-scell tl-scell-" + cell.type} style={{ left: bl, width: bw }}>
                      {bw > 22 && <span>{cell.type === "del" ? "·" : cell.token}</span>}
                    </div>
                  )}
                </React.Fragment>
              );
            })
          : <div className="tl-script-empty mono">paste a script in Check script to see it aligned here</div>}
      </div>
    </div>
  );
});

// Light overlay that follows the audio clock.
function TimelineCursor({ time, activeWord, wordById, pps, t0, scrollRef }) {
  const px = (time - t0) * pps;
  const aw = activeWord ? wordById[activeWord] : null;
  // keep the playhead in view while playing
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    const left = sc.scrollLeft, right = left + sc.clientWidth;
    if (px < left + 40 || px > right - 80) sc.scrollLeft = Math.max(0, px - sc.clientWidth * 0.4);
  }, [px, scrollRef]);
  return (
    <>
      {aw && (
        <div className="tl-active" style={{
          left: (aw.start - t0) * pps,
          width: Math.max(3, (aw.end - aw.start) * pps),
          top: LANES.ruler, height: LANES.wave + LANES.words,
        }} />
      )}
      <div className="tl-playhead" style={{ left: px }}>
        <div className="tl-playhead-knob" />
      </div>
    </>
  );
}

function Timeline({
  words, cards, derived, wordById, audio, pps, setPps, lane, activeWord, onFit, scrollRef,
}) {
  const lastEnd = words.length ? words[words.length - 1].end : 0;
  const t0 = 0;
  const t1 = Math.max(lastEnd, audio.duration || 0, 1) + 0.4;
  const totalW = Math.max(1, (t1 - t0) * pps);

  const seekFromEvent = (e) => {
    const sc = scrollRef.current;
    if (!sc) return;
    const rect = sc.getBoundingClientRect();
    const px = e.clientX - rect.left + sc.scrollLeft;
    const t = t0 + px / pps;
    if (e.target.closest && e.target.closest(".tl-blk")) {
      const wid = e.target.closest(".tl-blk").getAttribute("data-wid");
      const w = wordById[wid];
      if (w) { audio.playRange(w.start, w.end); return; }
    }
    audio.seek(t);
  };

  return (
    <section className="tl-dock">
      <div className="tl-head">
        <div className="tl-transport">
          <button className="icon-btn lg" onClick={audio.toggle} disabled={!audio.url}
            title={audio.playing ? "Pause (space)" : "Play (space)"}>
            {audio.playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <span className="mono tl-time">{clock(audio.time)} <span style={{ color: C.mut2 }}>/ {clock(t1)}</span></span>
          {audio.name
            ? <span className="tl-aname mono"><Volume2 size={12} /> {audio.name}{audio.decoding ? " · decoding…" : ""}</span>
            : <span className="tl-aname mono" style={{ color: C.mut2 }}>no audio loaded</span>}
          {audio.err && (
            <span className="mono" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: C.accentText }}>
              <AlertTriangle size={12} /> {audio.err}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button className="icon-btn" onClick={() => setPps((p) => Math.max(16, p / 1.4))} title="Zoom out"><ZoomOut size={14} /></button>
          <button className="icon-btn" onClick={() => setPps((p) => Math.min(600, p * 1.4))} title="Zoom in"><ZoomIn size={14} /></button>
          <button className="icon-btn" onClick={onFit} title="Fit to window"><Maximize2 size={14} /></button>
        </div>
      </div>
      <div className="tl-scroll" ref={scrollRef} onClick={seekFromEvent} style={{ height: TL_H }}>
        <div className="tl-inner" style={{ width: totalW, height: TL_H }}>
          <TimelineTrack words={words} cards={cards} derived={derived} wordById={wordById}
            channel={audio.channel} pps={pps} t0={t0} t1={t1} totalW={totalW} lane={lane} />
          <TimelineCursor time={audio.time} activeWord={activeWord} wordById={wordById}
            pps={pps} t0={t0} scrollRef={scrollRef} />
        </div>
      </div>
    </section>
  );
}

// =============================================================== main app ===
export default function CaptionSplitter() {
  const [words, setWords] = useState([]);
  const [cards, setCards] = useState([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [hlAnchor, setHlAnchor] = useState({});
  const [showCfg, setShowCfg] = useState(false);
  const [showQC, setShowQC] = useState(false);
  const [showTL, setShowTL] = useState(true);
  const [script, setScript] = useState("");
  const [ignored, setIgnored] = useState(() => new Set()); // rejected mismatch signatures
  const [cursor, setCursor] = useState(0);                 // current mismatch in the triage list
  const [located, setLocated] = useState(null);            // word id flashing as "located"
  const [modal, setModal] = useState(null);                // null | "shortcuts" | "aescript"
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [flash, setFlash] = useState({});
  const [pps, setPps] = useState(80);
  const [cfg, setCfg] = useState({ breathGap: 0.3, tailPad: 0.3, cardMaxWords: 4, smallMaxChars: 18, prefer2Row: true });
  const [past, setPast] = useState([]);     // history snapshots {words, cards, label}
  const [future, setFuture] = useState([]); // redo stack
  const lastTag = useRef(null);             // for coalescing repeated edits (e.g. highlight)

  const fileInput = useRef(null);
  const audioInput = useRef(null);
  const scriptInput = useRef(null);
  const tlScroll = useRef(null);
  const audio = useAudio();

  const wordById = useMemo(() => {
    const m = {}; for (const w of words) m[w.id] = w; return m;
  }, [words]);
  const derived = useMemo(
    () => (cards.length ? deriveTiming(cards, wordById, cfg.tailPad) : []),
    [cards, wordById, cfg.tailPad]
  );

  // live script alignment (drives both the QC panel and the timeline lane)
  const alignment = useMemo(
    () => (words.length && script.trim() ? alignScript(words, script) : null),
    [words, script]
  );
  const lane = useMemo(() => buildScriptLane(alignment), [alignment]);
  const allSubs = useMemo(() => (alignment ? alignment.ops.filter((o) => o.type === "sub") : []), [alignment]);
  const dels = alignment ? alignment.ops.filter((o) => o.type === "del").length : 0;
  const inss = alignment ? alignment.ops.filter((o) => o.type === "ins").length : 0;

  // A mismatch's identity is the (transcript word, script spelling) pair, so a
  // rejected one stays rejected across live re-alignment as long as it recurs.
  const sigOf = useCallback(
    (op) => (alignment && words[op.t] ? words[op.t].id + "→" + alignment.tokens[op.s].norm : ""),
    [alignment, words]
  );
  const activeSubs = useMemo(
    () => allSubs.filter((op) => !ignored.has(sigOf(op))),
    [allSubs, ignored, sigOf]
  );
  const ignoredSubs = useMemo(
    () => allSubs.filter((op) => ignored.has(sigOf(op))),
    [allSubs, ignored, sigOf]
  );
  const curIdx = activeSubs.length ? Math.min(Math.max(cursor, 0), activeSubs.length - 1) : -1;

  // which mismatches are close spelling variants (safe to auto-apply) vs
  // genuinely different words (leave for manual review)
  const closeSigs = useMemo(() => {
    const s = new Set();
    if (!alignment) return s;
    for (const op of activeSubs) {
      if (words[op.t] && isCloseSpelling(core(words[op.t].text), alignment.tokens[op.s].raw)) s.add(sigOf(op));
    }
    return s;
  }, [alignment, activeSubs, words, sigOf]);
  const closeCount = closeSigs.size;

  // word id -> card id, for showing each mismatch's card and locating it
  const cardOfWord = useMemo(() => {
    const m = {}; cards.forEach((c) => c.wordIds.forEach((id) => { m[id] = c.id; }));
    return m;
  }, [cards]);
  const locatedCardIdx = useMemo(
    () => (located ? cards.findIndex((c) => c.wordIds.indexOf(located) !== -1) : -1),
    [located, cards]
  );

  const activeWord = useMemo(
    () => (audio.url && words.length ? findActiveWord(words, audio.time) : null),
    [audio.url, audio.time, words]
  );
  const activeCardIdx = useMemo(() => {
    if (!activeWord) return -1;
    return cards.findIndex((c) => c.wordIds.indexOf(activeWord) !== -1);
  }, [activeWord, cards]);

  const loaded = words.length > 0;
  const warnCount = derived.filter((d) => d.topOver || d.botOver).length;
  const totalDur = derived.length ? derived[derived.length - 1].outSec - derived[0].inSec : 0;

  // ---- history: every model change goes through apply() ----
  // Snapshots are cheap: all edits are immutable (new arrays / new word objects),
  // so a snapshot is just a pair of references to the pre-change arrays.
  // `tag` coalesces a run of the same kind of edit (e.g. nudging a highlight on
  // one card) into a single undo step.
  const apply = useCallback((nextWords, nextCards, tag = null) => {
    if (tag && tag === lastTag.current) {
      setWords(nextWords); setCards(nextCards); setFuture([]);
      return;
    }
    setPast((p) => [...p, { words, cards }].slice(-200));
    setFuture([]);
    lastTag.current = tag;
    setWords(nextWords); setCards(nextCards);
  }, [words, cards]);

  const resetDoc = useCallback((nextWords, nextCards) => {
    // a fresh document (load / re-import): history starts clean
    setPast([]); setFuture([]); lastTag.current = null;
    setWords(nextWords); setCards(nextCards);
  }, []);

  const undo = useCallback(() => {
    if (!past.length) return;
    const prev = past[past.length - 1];
    setFuture((f) => [...f, { words, cards }]);
    setPast((p) => p.slice(0, -1));
    setWords(prev.words); setCards(prev.cards);
    lastTag.current = null; setHlAnchor({}); setEditing(null);
  }, [past, words, cards]);

  const redo = useCallback(() => {
    if (!future.length) return;
    const nxt = future[future.length - 1];
    setPast((p) => [...p, { words, cards }]);
    setFuture((f) => f.slice(0, -1));
    setWords(nxt.words); setCards(nxt.cards);
    lastTag.current = null; setHlAnchor({}); setEditing(null);
  }, [future, words, cards]);

  // ---- load transcript ----
  const ingest = useCallback((text, name) => {
    let raw;
    try { raw = JSON.parse(text.replace(/^\uFEFF/, "")); }
    catch (e) { setError("That file isn't valid JSON. " + e.message); return; }
    try {
      if (raw && Array.isArray(raw.words) && Array.isArray(raw.cards)) {
        resetDoc(computeEmphasis(raw.words), raw.cards);
      } else if (raw && Array.isArray(raw.segments)) {
        const w = flattenTranscript(raw);
        if (!w.length) { setError("No word-level timing found. Export the transcript with words enabled."); return; }
        resetDoc(w, seedCards(w, cfg));
      } else {
        setError("Unrecognized JSON. Load a Premiere transcript (with segments and words) or a word table exported here.");
        return;
      }
      setError(""); setFileName(name); setHlAnchor({});
    } catch (e) { setError("Couldn't process the file: " + e.message); }
  }, [cfg, resetDoc]);

  const onFile = (file) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => ingest(String(r.result), file.name);
    r.onerror = () => setError("Couldn't read the file.");
    r.readAsText(file);
  };

  // ---- structural ops (all routed through apply for undo) ----
  const splitCard = useCallback((cardIdx, afterLocal) => {
    const card = cards[cardIdx];
    if (!card || afterLocal >= card.wordIds.length - 1) return;
    const aIds = card.wordIds.slice(0, afterLocal + 1);
    const bIds = card.wordIds.slice(afterLocal + 1);
    const a = { id: 0, wordIds: aIds, ...rePickFor(aIds, wordById, 40) };
    const b = { id: 0, wordIds: bIds, ...rePickFor(bIds, wordById, 40) };
    const next = renumber(cards.slice(0, cardIdx).concat([a, b], cards.slice(cardIdx + 1)));
    apply(words, next); setHlAnchor({});
  }, [cards, words, wordById, apply]);

  const mergeUp = useCallback((cardIdx) => {
    if (cardIdx === 0 || !cards[cardIdx]) return;
    const merged = cards[cardIdx - 1].wordIds.concat(cards[cardIdx].wordIds);
    const m = { id: 0, wordIds: merged, ...rePickFor(merged, wordById, 40) };
    const next = renumber(cards.slice(0, cardIdx - 1).concat([m], cards.slice(cardIdx + 1)));
    apply(words, next); setHlAnchor({});
  }, [cards, words, wordById, apply]);

  const mergeDown = useCallback((cardIdx) => {
    if (cardIdx >= cards.length - 1) return;
    const merged = cards[cardIdx].wordIds.concat(cards[cardIdx + 1].wordIds);
    const m = { id: 0, wordIds: merged, ...rePickFor(merged, wordById, 40) };
    const next = renumber(cards.slice(0, cardIdx).concat([m], cards.slice(cardIdx + 2)));
    apply(words, next); setHlAnchor({});
  }, [cards, words, wordById, apply]);

  // ---- merge two adjacent WORD atoms into one (combine span + text) ----
  // The kept atom retains the first word's id, so every card reference survives;
  // the dropped id is removed and the card's highlight span is re-indexed.
  const mergeWordsByIds = useCallback((aId, bId) => {
    const gi = words.findIndex((w) => w.id === aId);
    if (gi < 0 || !words[gi + 1] || words[gi + 1].id !== bId) return;
    const a = words[gi], b = words[gi + 1];
    const merged = { ...a, text: (a.text + " " + b.text).replace(/\s+/g, " ").trim(), end: b.end, eos: b.eos };
    const nextW = words.slice(0, gi).concat([merged], words.slice(gi + 2));
    const nextC = cards.map((c) => {
      const li = c.wordIds.indexOf(b.id);
      if (li === -1) return c;
      const ids = c.wordIds.filter((id) => id !== b.id);
      const fix = (xx) => (xx === li ? li - 1 : xx > li ? xx - 1 : xx);
      let hf = fix(c.hlFrom), ht = fix(c.hlTo);
      if (ht < hf) ht = hf;
      return { ...c, wordIds: ids, hlFrom: Math.max(0, hf), hlTo: Math.max(0, ht) };
    });
    apply(nextW, nextC); setHlAnchor({}); setEditing(null);
  }, [words, cards, apply]);

  // ---- highlight span (consecutive tweaks on one card coalesce into one undo) ----
  const setHL = useCallback((cardIdx, local, shift) => {
    const next = cards.map((c, i) => {
      if (i !== cardIdx) return c;
      if (shift) {
        const anchor = hlAnchor[cardIdx] != null ? hlAnchor[cardIdx] : c.hlFrom;
        return { ...c, hlFrom: Math.min(anchor, local), hlTo: Math.max(anchor, local) };
      }
      return { ...c, hlFrom: local, hlTo: local };
    });
    apply(words, next, "hl:" + cards[cardIdx].id);
    if (!shift) setHlAnchor((a) => ({ ...a, [cardIdx]: local }));
  }, [cards, words, hlAnchor, apply]);

  // ---- text edit ----
  const startEdit = useCallback((w) => { setEditing(w.id); setEditVal(w.text); }, []);
  const commitEdit = useCallback(() => {
    if (editing == null) return;
    const cur = editing;
    const w = words.find((x) => x.id === cur);
    if (w && w.text !== editVal) apply(words.map((x) => (x.id === cur ? { ...x, text: editVal } : x)), cards);
    setEditing(null); setEditVal("");
  }, [editing, editVal, words, cards, apply]);
  const cancelEdit = useCallback(() => { setEditing(null); setEditVal(""); }, []);

  // ---- play a card's spoken span ----
  const playCard = useCallback((ci) => {
    const d = derived[ci];
    if (d) audio.playRange(d.inSec, d.spokenEnd);
  }, [derived, audio]);
  const playWord = useCallback((w) => audio.playRange(w.start, w.end), [audio]);

  // ---- QC apply / reject / locate ----
  const flashWord = useCallback((wid, ms = 1400) => {
    setFlash((f) => ({ ...f, [wid]: true }));
    setTimeout(() => setFlash((f) => { const n = { ...f }; delete n[wid]; return n; }), ms);
  }, []);

  // scroll a word into view in the card list, ring it, and (if loaded) play it
  const locateWord = useCallback((wid, withAudio) => {
    setLocated(wid);
    if (typeof document !== "undefined") {
      requestAnimationFrame(() => {
        const el = document.querySelector('.tok[data-wid="' + wid + '"]');
        if (el && el.scrollIntoView) el.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    }
    const w = wordById[wid];
    if (withAudio && w && audio.url) audio.playRange(w.start, w.end);
    setTimeout(() => setLocated((cur) => (cur === wid ? null : cur)), 2600);
  }, [wordById, audio]);

  const applyFix = useCallback((op) => {
    if (!alignment || !words[op.t]) return;
    const wid = words[op.t].id;
    const tok = alignment.tokens[op.s];
    apply(words.map((w) => (w.id === wid ? { ...w, text: tok.raw } : w)), cards);
    flashWord(wid);
  }, [alignment, words, cards, apply, flashWord]);

  // reject = "this isn't a spelling error" — remember it and stop flagging it
  const rejectFix = useCallback((op) => {
    const sig = sigOf(op);
    if (sig) setIgnored((s) => { const n = new Set(s); n.add(sig); return n; });
  }, [sigOf]);
  const restoreFix = useCallback((op) => {
    const sig = sigOf(op);
    if (sig) setIgnored((s) => { const n = new Set(s); n.delete(sig); return n; });
  }, [sigOf]);

  // act on the current mismatch, then reveal the next one
  const applyCurrent = useCallback(() => {
    if (curIdx < 0) return;
    applyFix(activeSubs[curIdx]);
    const nxt = activeSubs[curIdx + 1];
    if (nxt && words[nxt.t]) locateWord(words[nxt.t].id, false);
  }, [curIdx, activeSubs, applyFix, words, locateWord]);
  const rejectCurrent = useCallback(() => {
    if (curIdx < 0) return;
    rejectFix(activeSubs[curIdx]);
    const nxt = activeSubs[curIdx + 1];
    if (nxt && words[nxt.t]) locateWord(words[nxt.t].id, false);
  }, [curIdx, activeSubs, rejectFix, words, locateWord]);
  const moveCursor = useCallback((delta) => {
    if (!activeSubs.length) return;
    const next = Math.min(Math.max(curIdx + delta, 0), activeSubs.length - 1);
    setCursor(next);
    const op = activeSubs[next];
    if (op && words[op.t]) locateWord(words[op.t].id, false);
  }, [activeSubs, curIdx, words, locateWord]);

  // apply a batch of mismatches in ONE undoable step
  const applyBatch = useCallback((ops) => {
    if (!alignment || !ops.length) return;
    const repl = {};
    for (const op of ops) if (words[op.t]) repl[words[op.t].id] = alignment.tokens[op.s].raw;
    const ids = Object.keys(repl);
    if (!ids.length) return;
    apply(words.map((w) => (repl[w.id] != null ? { ...w, text: repl[w.id] } : w)), cards);
    ids.forEach((wid) => flashWord(wid));
  }, [alignment, words, cards, apply, flashWord]);

  // auto-fix only the close spelling variants; leave different words for review
  const autoFixSpellings = useCallback(() => {
    applyBatch(activeSubs.filter((op) => closeSigs.has(sigOf(op))));
  }, [applyBatch, activeSubs, closeSigs, sigOf]);
  const applyAllRemaining = useCallback(() => {
    if (typeof window !== "undefined" && activeSubs.length > 1 &&
        !window.confirm("Apply ALL " + activeSubs.length + " mismatches, including ones that look like different words? You can undo this.")) return;
    applyBatch(activeSubs);
  }, [applyBatch, activeSubs]);

  const resegment = () => { if (loaded) { apply(words, seedCards(words, cfg)); setHlAnchor({}); } };

  // ---- AE CaptionBuilder script: copy / download ----
  const copyBuilder = useCallback(async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(CAPTION_BUILDER); ok = true; }
    catch (e) {
      try {
        const ta = document.createElement("textarea");
        ta.value = CAPTION_BUILDER; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select(); ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch (e2) { ok = false; }
    }
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1800); }
  }, []);
  const downloadBuilder = useCallback(() => {
    const blob = new Blob([CAPTION_BUILDER], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "CaptionBuilder.jsx"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  // ---- exports ----
  const exportCaptions = () => download((fileName.replace(/\.json$/i, "") || "captions") + "_captions.json", buildCaptionsJSON(cards, derived));
  const exportTable = () => download((fileName.replace(/\.json$/i, "") || "captions") + "_wordtable.json", { meta: { tool: "CaptionSplitter", version: 2.5, cfg }, words, cards });

  // ---- fit timeline to window ----
  const fitTimeline = useCallback(() => {
    const sc = tlScroll.current;
    const lastEnd = words.length ? words[words.length - 1].end : 0;
    const t1 = Math.max(lastEnd, audio.duration || 0, 1) + 0.4;
    if (sc && t1 > 0) setPps(Math.max(16, Math.min(600, (sc.clientWidth - 4) / t1)));
  }, [words, audio.duration]);

  // ---- spacebar play/pause (when not editing/typing) ----
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== "Space") return;
      const tag = (e.target.tagName || "").toLowerCase();
      if (modal || editing != null || tag === "input" || tag === "textarea") return;
      if (!audio.url) return;
      e.preventDefault(); audio.toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, modal, audio.url, audio.toggle]);

  // ---- undo / redo: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z (or Ctrl+Y) ----
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const tag = (e.target.tagName || "").toLowerCase();
      // let the browser's native text undo win while typing
      if (editing != null || tag === "input" || tag === "textarea") return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, undo, redo]);

  // ---- script triage shortcuts (only while the Check-script panel is open) ----
  useEffect(() => {
    if (!showQC || modal) return;
    const onKey = (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      // never hijack typing (script box, word edit) or modifier combos (undo etc.)
      if (editing != null || tag === "input" || tag === "textarea" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (curIdx < 0) return;
      if (e.key === "Enter") { e.preventDefault(); applyCurrent(); }
      else if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); rejectCurrent(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); moveCursor(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); moveCursor(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showQC, modal, editing, curIdx, applyCurrent, rejectCurrent, moveCursor]);

  // ====================================================================== UI
  return (
    <div className="cap-root" style={rootStyle}>
      <style>{CSS}</style>

      {/* the player element lives in the DOM so playback works inside sandboxed
          iframes; React binds its source to the loaded blob URL */}
      <audio ref={audio.elRef} src={audio.url || undefined} preload="auto" style={{ display: "none" }} />

      {/* ---------------- top bar ---------------- */}
      <header style={barStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <img src={LOGO_SRC} alt="" width={28} height={28}
            style={{ borderRadius: 7, display: "block", flex: "0 0 auto" }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 650, letterSpacing: "-0.01em" }}>
              Caption Splitter <span className="mono" style={{ fontSize: 9.5, color: C.mut2, fontWeight: 600, verticalAlign: "middle" }}>V2.5</span>
            </div>
            <div className="mono" style={{ fontSize: 10.5, color: C.mut2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {loaded ? fileName : "no transcript loaded"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button className="btn" onClick={() => fileInput.current && fileInput.current.click()}>
            <Upload size={13} /> {loaded ? "Replace" : "Load transcript"}
          </button>
          <input ref={fileInput} type="file" accept=".json,application/json" style={{ display: "none" }}
            onChange={(e) => { onFile(e.target.files[0]); e.target.value = ""; }} />
          {loaded && <>
            <span style={{ display: "inline-flex", gap: 2 }}>
              <button className="btn btn-sm" onClick={undo} disabled={!past.length} title="Undo (Ctrl/Cmd+Z)">
                <Undo2 size={13} /> Undo
              </button>
              <button className="btn btn-sm" onClick={redo} disabled={!future.length} title="Redo (Ctrl/Cmd+Shift+Z)">
                <Redo2 size={13} />
              </button>
            </span>
            <button className="btn" onClick={() => audioInput.current && audioInput.current.click()} data-on={audio.url ? "1" : ""}>
              <Music size={13} /> {audio.url ? "Replace audio" : "Load audio"}
            </button>
            <input ref={audioInput} type="file" accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.flac" style={{ display: "none" }}
              onChange={(e) => { audio.load(e.target.files[0]); e.target.value = ""; setShowTL(true); }} />
            <button className="btn" onClick={() => setShowTL((v) => !v)} data-on={showTL ? "1" : ""}>
              <Clock size={13} /> Timeline
            </button>
            <button className="btn" onClick={() => setShowQC((v) => !v)} data-on={showQC ? "1" : ""}>
              <ListChecks size={13} /> Check script {activeSubs.length ? <span className="badge">{activeSubs.length}</span> : null}
            </button>
            <button className="btn" onClick={() => setShowCfg((v) => !v)} data-on={showCfg ? "1" : ""}>
              <Sliders size={13} /> Rules
            </button>
            <button className="btn" onClick={() => setModal("shortcuts")} title="Keyboard & mouse shortcuts">
              <Keyboard size={13} /> Shortcuts
            </button>
            <button className="btn btn-ghost" onClick={() => setModal("aescript")} title="Get the After Effects builder script">
              <FileCode2 size={13} /> AE script
            </button>
            <button className="btn btn-ghost" onClick={exportTable}><Layers size={13} /> Word table</button>
            <button className="btn btn-accent" onClick={exportCaptions}><Download size={13} /> Export captions</button>
          </>}
        </div>
      </header>

      {/* ---------------- config strip ---------------- */}
      {loaded && showCfg && (
        <div style={cfgStrip}>
          {[
            ["Breath gap", "breathGap", 0.05, "s"],
            ["Tail hold", "tailPad", 0.05, "s"],
            ["Max words / card", "cardMaxWords", 1, ""],
            ["Small row chars", "smallMaxChars", 1, ""],
          ].map(([label, key, step, unit]) => (
            <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 10.5, color: C.mut, letterSpacing: "0.02em", textTransform: "uppercase" }}>{label}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input className="num mono" type="number" step={step} value={cfg[key]}
                  onChange={(e) => setCfg((c) => ({ ...c, [key]: parseFloat(e.target.value) || 0 }))} />
                {unit && <span className="mono" style={{ fontSize: 11, color: C.mut2 }}>{unit}</span>}
              </span>
            </label>
          ))}
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10.5, color: C.mut, letterSpacing: "0.02em", textTransform: "uppercase" }}>Layout</span>
            <button className="btn" data-on={cfg.prefer2Row ? "1" : ""}
              onClick={() => setCfg((c) => ({ ...c, prefer2Row: !c.prefer2Row }))}
              title="Default cards to two rows; only use three when a single small line can't hold the context">
              <Layers size={13} /> {cfg.prefer2Row ? "Prefer 2-row" : "Allow 3-row"}
            </button>
          </label>
          <button className="btn" onClick={resegment} style={{ alignSelf: "flex-end" }}>
            <RotateCcw size={13} /> Re-segment
          </button>
          <div style={{ fontSize: 11, color: C.mut2, alignSelf: "flex-end", maxWidth: 260, lineHeight: 1.45 }}>
            Re-segment rebuilds cards from the transcript and discards manual splits and merges. With <em>Prefer 2-row</em> on, cards lead with a small line into the highlight and never strand a single word. Timing always derives from word timing.
          </div>
        </div>
      )}

      {/* ---------------- stats ---------------- */}
      {loaded && (
        <div style={statBar}>
          <Stat icon={<Layers size={12} />} label="cards" value={cards.length} />
          <Stat icon={<Type size={12} />} label="words" value={words.length} />
          <Stat icon={<Clock size={12} />} label="duration" value={totalDur.toFixed(1) + "s"} />
          <Stat icon={<AlertTriangle size={12} />} label="over-limit rows" value={warnCount}
            tone={warnCount ? "warn" : null} />
          {alignment && <Stat icon={<ListChecks size={12} />} label="script mismatches" value={activeSubs.length}
            tone={activeSubs.length ? "accent" : "ok"} />}
        </div>
      )}

      {/* ---------------- body ---------------- */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* main */}
        <main style={{ flex: 1, overflow: "auto", padding: loaded ? "14px 18px 60px" : 0 }}>
          {!loaded ? (
            <EmptyState dragOver={dragOver} error={error}
              onPick={() => fileInput.current && fileInput.current.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); onFile(e.dataTransfer.files[0]); }} />
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 12, fontSize: 11.5, color: C.mut2, lineHeight: 1.5 }}>
                <Eye size={13} style={{ flex: "0 0 auto", marginTop: 1 }} />
                <span>
                  Click a word to make it the <span style={{ color: C.accentText }}>highlight</span>; shift-click to extend.
                  Double-click to fix a typo. Between words: <Scissors size={10} style={{ verticalAlign: "-1px" }} /> splits the card,
                  {" "}<Link2 size={10} style={{ verticalAlign: "-1px" }} /> merges the two words into one timing atom.
                  {audio.url && <> Tap <Play size={10} style={{ verticalAlign: "-1px" }} /> on a card to hear it; the live word is lit.</>}
                </span>
              </div>
              {cards.map((card, ci) => (
                <CardRow key={card.id + "-" + card.wordIds[0]} card={card} ci={ci} d={derived[ci]}
                  wordById={wordById} editing={editing} editVal={editVal} flash={flash}
                  activeWord={ci === activeCardIdx ? activeWord : null}
                  located={ci === locatedCardIdx ? located : null} hasAudio={!!audio.url}
                  setEditVal={setEditVal} startEdit={startEdit} commitEdit={commitEdit} cancelEdit={cancelEdit}
                  setHL={setHL} splitCard={splitCard} mergeUp={mergeUp} mergeDown={mergeDown}
                  mergeWords={mergeWordsByIds} playCard={playCard} playWord={playWord}
                  isLast={ci === cards.length - 1} />
              ))}
            </>
          )}
        </main>

        {/* QC panel */}
        {loaded && showQC && (
          <aside style={qcPanel}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600 }}>
                <FileText size={14} color={C.accent} /> Cross-check the script
              </div>
              <button className="icon-btn" onClick={() => setShowQC(false)}><X size={14} /></button>
            </div>
            <p style={{ fontSize: 11.5, color: C.mut, lineHeight: 1.5, margin: "0 0 10px" }}>
              Paste the script you actually wrote — it's the source of truth for <em>spelling</em>; the transcript stays the source of truth for <em>timing</em>. <strong>Auto-fix spellings</strong> corrects every close variant at once; the dot on each row shows whether it's a likely typo (<span style={{ color: C.ok }}>●</span>) or a genuinely different word (<span style={{ color: C.warn }}>●</span>) to judge yourself.
            </p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, margin: "0 0 6px" }}>
              <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.04em", color: C.mut }}>Script</span>
              <button className="btn btn-sm btn-ghost" onClick={() => scriptInput.current && scriptInput.current.click()}>
                <Upload size={12} /> Load .txt
              </button>
              <input ref={scriptInput} type="file" accept=".txt,text/plain,.md,.srt,.vtt" style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files[0]; e.target.value = "";
                  if (!file) return;
                  const r = new FileReader();
                  r.onload = () => setScript(String(r.result || ""));
                  r.readAsText(file);
                }} />
            </div>
            <textarea className="ta" value={script} onChange={(e) => setScript(e.target.value)}
              placeholder="Paste the script here, or Load .txt…" spellCheck={false} />

            {alignment && (
              <div style={{ marginTop: 14 }}>
                {activeSubs.length === 0 ? (
                  <div style={qcClean}>
                    <Check size={14} color={C.ok} /> No spelling mismatches to review{ignoredSubs.length ? " (" + ignoredSubs.length + " rejected)" : ""}.
                  </div>
                ) : (
                  <>
                    {/* bulk actions */}
                    <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                      <button className="btn btn-sm btn-accent" onClick={autoFixSpellings} disabled={!closeCount}
                        title="Apply every close spelling variant in one undoable step">
                        <Check size={12} /> Auto-fix {closeCount} spelling{closeCount === 1 ? "" : "s"}
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={applyAllRemaining}
                        title="Apply all listed mismatches, including different-looking words">
                        Apply all {activeSubs.length}
                      </button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, margin: "2px 0 8px" }}>
                      <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.04em", color: C.mut }}>
                        {activeSubs.length} to review · #{curIdx + 1}
                      </span>
                      <span style={{ display: "flex", gap: 4 }}>
                        <button className="btn btn-sm" onClick={applyCurrent} title="Apply the current mismatch (Enter)">
                          <Check size={12} /> Apply <kbd className="kbd">⏎</kbd>
                        </button>
                        <button className="btn btn-sm btn-ghost" onClick={rejectCurrent} title="Reject — not a spelling error (Backspace)">
                          <X size={12} /> Reject <kbd className="kbd">⌫</kbd>
                        </button>
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: C.mut2, margin: "0 0 8px" }}>↑/↓ move · click a row to hear it</div>
                    {activeSubs.map((op, k) => {
                      const wid = words[op.t].id;
                      const isCur = k === curIdx;
                      const close = closeSigs.has(sigOf(op));
                      return (
                        <div key={sigOf(op)} className={"sub-row" + (isCur ? " cur" : "")}
                          onClick={() => { setCursor(k); locateWord(wid, true); }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, fontSize: 12.5 }}>
                            <span title={close ? "Likely spelling variant — auto-fixable" : "Looks like a different word — review"}
                              style={{ flex: "0 0 auto", width: 7, height: 7, borderRadius: 4, background: close ? C.ok : C.warn }} />
                            <span className="mono sub-card">C{cardOfWord[wid] || "?"}</span>
                            <span style={{ color: C.accentText, textDecoration: "line-through", textDecorationColor: C.mut2 }}>{core(words[op.t].text)}</span>
                            <span style={{ color: C.mut2 }}>→</span>
                            <span style={{ color: C.ok, fontWeight: 600 }}>{alignment.tokens[op.s].raw}</span>
                          </div>
                          <span style={{ display: "flex", gap: 3, flex: "0 0 auto" }}>
                            <button className="icon-btn sm" title="Apply this spelling"
                              onClick={(e) => { e.stopPropagation(); applyFix(op); }}><Check size={13} /></button>
                            <button className="icon-btn sm" title="Reject — not a typo"
                              onClick={(e) => { e.stopPropagation(); rejectFix(op); }}><X size={13} /></button>
                          </span>
                        </div>
                      );
                    })}
                  </>
                )}

                {ignoredSubs.length > 0 && (
                  <details style={{ marginTop: 12, borderTop: "1px solid " + C.borderSoft, paddingTop: 10 }}>
                    <summary style={{ fontSize: 11, color: C.mut, cursor: "pointer" }}>
                      {ignoredSubs.length} rejected (not treated as typos)
                    </summary>
                    <div style={{ marginTop: 8 }}>
                      {ignoredSubs.map((op) => {
                        const wid = words[op.t].id;
                        return (
                          <div key={sigOf(op)} className="sub-row" style={{ opacity: 0.7 }}
                            onClick={() => locateWord(wid, true)}>
                            <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, fontSize: 12 }}>
                              <span className="mono sub-card">C{cardOfWord[wid] || "?"}</span>
                              <span style={{ color: C.mut }}>{core(words[op.t].text)}</span>
                              <span style={{ color: C.mut2 }}>→</span>
                              <span style={{ color: C.mut }}>{alignment.tokens[op.s].raw}</span>
                            </div>
                            <button className="btn btn-sm btn-ghost" onClick={(e) => { e.stopPropagation(); restoreFix(op); }}>Restore</button>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                )}

                {(dels > 0 || inss > 0) && (
                  <div style={{ marginTop: 12, fontSize: 11, color: C.mut2, lineHeight: 1.5, borderTop: "1px solid " + C.borderSoft, paddingTop: 10 }}>
                    {dels > 0 && <div>{dels} transcript word{dels === 1 ? "" : "s"} not in the script — likely filler or a mis-hear. Fix the text inline if needed.</div>}
                    {inss > 0 && <div style={{ marginTop: 4 }}>{inss} script word{inss === 1 ? "" : "s"} missing from the transcript — shown as ＋ inserts on the timeline. No timing exists to attach; add by hand in AE if it matters.</div>}
                  </div>
                )}
              </div>
            )}
          </aside>
        )}
      </div>

      {/* ---------------- timeline dock ---------------- */}
      {loaded && showTL && (
        <Timeline words={words} cards={cards} derived={derived} wordById={wordById}
          audio={audio} pps={pps} setPps={setPps} lane={lane} activeWord={activeWord}
          onFit={fitTimeline} scrollRef={tlScroll} />
      )}

      {modal === "shortcuts" && <ShortcutsModal hasAudio={!!audio.url} onClose={() => setModal(null)} />}
      {modal === "aescript" && (
        <AeScriptModal copied={copied} onCopy={copyBuilder} onDownload={downloadBuilder} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

// ----------------------------------------------------------- modals --------
function Modal({ title, icon, onClose, wide, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className={"modal" + (wide ? " wide" : "")} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 650 }}>{icon}{title}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function Keys({ children }) {
  // render "Ctrl / Cmd + Z" style strings into <kbd> caps
  return <span style={{ display: "inline-flex", gap: 3, flexWrap: "wrap" }}>
    {children.split("+").map((part, i) => (
      <span key={i} style={{ display: "inline-flex", gap: 3 }}>
        {i > 0 && <span style={{ color: C.mut2 }}>+</span>}
        {part.split("/").map((alt, j) => (
          <span key={j} style={{ display: "inline-flex", gap: 3 }}>
            {j > 0 && <span style={{ color: C.mut2, alignSelf: "center", fontSize: 10 }}>or</span>}
            <kbd className="kbd lg">{alt.trim()}</kbd>
          </span>
        ))}
      </span>
    ))}
  </span>;
}

function ShortcutsModal({ hasAudio, onClose }) {
  const sec = (label) => <div className="sc-sec">{label}</div>;
  const row = (keys, desc) => (
    <div className="sc-row"><div className="sc-keys"><Keys>{keys}</Keys></div><div className="sc-desc">{desc}</div></div>
  );
  return (
    <Modal title="Shortcuts" icon={<Keyboard size={16} color={C.accent} />} onClose={onClose} wide>
      <div className="sc-grid">
        <div>
          {sec("Playback")}
          {row("Space", "Play / pause audio")}
          {row("Alt + click", "Play just that word")}
          {sec("History")}
          {row("Ctrl/Cmd + Z", "Undo")}
          {row("Ctrl/Cmd + Shift + Z", "Redo")}
          {row("Ctrl + Y", "Redo (alternate)")}
          {sec("Editing a word")}
          {row("Double-click", "Edit a word's text")}
          {row("Enter", "Commit the edit")}
          {row("Esc", "Cancel the edit")}
        </div>
        <div>
          {sec("Highlight & cards")}
          {row("Click", "Make a word the highlight")}
          {row("Shift + click", "Extend the highlight")}
          {sec("Script review (Check script open)")}
          {row("Enter", "Apply the current mismatch")}
          {row("Backspace/Delete", "Reject the current mismatch")}
          {row("↑ / ↓", "Move between mismatches")}
          {row("Click a row", "Jump to it" + (hasAudio ? " and hear it" : ""))}
        </div>
      </div>
      <div className="sc-mouse">
        Mouse on the card stream: <b>click</b> sets the highlight, <b>shift-click</b> extends it,
        <b> double-click</b> edits text. Between two words, the <Scissors size={11} style={{ verticalAlign: "-2px" }} /> splits
        the card and the <Link2 size={11} style={{ verticalAlign: "-2px" }} /> merges the two words into one timing atom. The
        card rail's <ArrowUpToLine size={11} style={{ verticalAlign: "-2px" }} />/<ArrowDownToLine size={11} style={{ verticalAlign: "-2px" }} /> merge
        a card into its neighbour{hasAudio ? <>, and <Play size={11} style={{ verticalAlign: "-2px" }} /> plays the card.</> : "."}
      </div>
    </Modal>
  );
}

function AeScriptModal({ copied, onCopy, onDownload, onClose }) {
  return (
    <Modal title="CaptionBuilder.jsx — After Effects script" icon={<FileCode2 size={16} color={C.accent} />} onClose={onClose} wide>
      <p style={{ fontSize: 12.5, color: C.mut, lineHeight: 1.55, margin: "0 0 10px" }}>
        This is the downstream After Effects script. Export your captions JSON above, then run this in AE
        (<span className="mono" style={{ fontSize: 11 }}>File ▸ Scripts ▸ Run Script File…</span>) and pick that JSON to build the per-row-timed caption layers.
      </p>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <button className="btn btn-accent btn-sm" onClick={onCopy}>
          {copied ? <ClipboardCheck size={13} /> : <Copy size={13} />} {copied ? "Copied!" : "Copy script"}
        </button>
        <button className="btn btn-sm" onClick={onDownload}><Download size={13} /> Download .jsx</button>
      </div>
      <div style={{ fontSize: 11.5, color: C.mut2, lineHeight: 1.5, margin: "0 0 10px", background: C.panel2, border: "1px solid " + C.border, borderRadius: 8, padding: "9px 11px" }}>
        <b style={{ color: C.text }}>One-time font setup in AE:</b> make a text layer set to your highlight font (Europa Grotesk SH), name it exactly <span className="mono">REF_HL</span>; make another set to your small font (Inter Light), name it <span className="mono">REF_SM</span>. Leave both in the comp and run — the script copies fonts from them so they never substitute.
      </div>
      <pre className="code-block">{CAPTION_BUILDER}</pre>
    </Modal>
  );
}

// ----------------------------------------------------------- subcomponents --
function Stat({ icon, label, value, tone }) {
  const col = tone === "warn" ? C.warn : tone === "accent" ? C.accentText : tone === "ok" ? C.ok : C.text;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <span style={{ color: C.mut2, display: "grid", placeItems: "center" }}>{icon}</span>
      <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: col }}>{value}</span>
      <span style={{ fontSize: 10.5, color: C.mut2, textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</span>
    </div>
  );
}

const CardRow = React.memo(function CardRow({
  card, ci, d, wordById, editing, editVal, flash, activeWord, located, hasAudio,
  setEditVal, startEdit, commitEdit, cancelEdit, setHL, splitCard, mergeUp, mergeDown,
  mergeWords, playCard, playWord, isLast,
}) {
  if (!d) return null;
  const ws = d.top.concat(d.hl, d.bot);
  return (
    <div className="card-row" style={cardRow}>
      {/* left rail */}
      <div style={cardRail}>
        <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: C.text }}>C{card.id}</div>
        <div className="mono" style={{ fontSize: 10, color: C.mut2 }}>{cardRowCount(card)}-row</div>
        <div style={{ display: "flex", gap: 2, marginTop: 2 }}>
          {hasAudio && (
            <button className="icon-btn sm" title="Play this card's audio" onClick={() => playCard(ci)}>
              <Play size={12} />
            </button>
          )}
          {ci > 0 && (
            <button className="icon-btn sm" title="Merge into previous card" onClick={() => mergeUp(ci)}>
              <ArrowUpToLine size={12} />
            </button>
          )}
          {!isLast && (
            <button className="icon-btn sm" title="Merge into next card" onClick={() => mergeDown(ci)}>
              <ArrowDownToLine size={12} />
            </button>
          )}
        </div>
      </div>

      {/* center: editable word stream */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 0" }}>
          {ws.map((w, local) => {
            const role = local < card.hlFrom ? "top" : local <= card.hlTo ? "hl" : "bot";
            const isEditing = editing === w.id;
            const isActive = activeWord === w.id;
            const isLocated = located === w.id;
            return (
              <React.Fragment key={w.id}>
                {isEditing ? (
                  <input className="tok-edit mono" autoFocus value={editVal}
                    onChange={(e) => setEditVal(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") cancelEdit(); }}
                    style={{ width: Math.max(40, editVal.length * 9 + 18) }} />
                ) : (
                  <span data-wid={w.id}
                    className={"tok tok-" + role + (flash[w.id] ? " tok-flash" : "") + (isActive ? " tok-active" : "") + (isLocated ? " tok-located" : "")}
                    title={core(w.text) + "  ·  " + w.start.toFixed(2) + "–" + w.end.toFixed(2) + "s  ·  " + w.id}
                    onClick={(e) => { if (e.altKey && hasAudio) { playWord(w); return; } setHL(ci, local, e.shiftKey); }}
                    onDoubleClick={() => startEdit(w)}>
                    {core(w.text)}
                  </span>
                )}
                {local < ws.length - 1 && (
                  <span className="gap-ctl">
                    <button className="split-handle" title="Split card after this word"
                      onClick={() => splitCard(ci, local)}>
                      <Scissors size={10} />
                    </button>
                    <button className="merge-handle" title="Merge these two words into one"
                      onClick={() => mergeWords(w.id, ws[local + 1].id)}>
                      <Link2 size={10} />
                    </button>
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* derived timing line */}
        <div className="mono" style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 10.5, color: C.mut2, flexWrap: "wrap" }}>
          <span><span style={{ color: C.mut }}>in</span> {shortT(d.inSec)}</span>
          <span><span style={{ color: C.mut }}>out</span> {shortT(d.outSec)}</span>
          <span><span style={{ color: C.mut }}>hold</span> {(d.outSec - d.inSec).toFixed(2)}s</span>
          {d.top.length > 0 && <span><span style={{ color: C.mut }}>top in</span> {shortT(d.topIn)}</span>}
          {d.bot.length > 0 && <span><span style={{ color: C.mut }}>bot in</span> {shortT(d.botIn)}</span>}
          {(d.topOver || d.botOver) && (
            <span style={{ color: C.warn, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <AlertTriangle size={11} /> small row over {18} chars
            </span>
          )}
        </div>
      </div>

      {/* right: live preview of the AE card */}
      <CardPreview d={d} />
    </div>
  );
});

function EmptyState({ dragOver, error, onPick, onDragOver, onDragLeave, onDrop }) {
  return (
    <div style={{ minHeight: "calc(100dvh - 49px)", display: "grid", placeItems: "center", padding: 24 }}>
      <div className={"dropzone" + (dragOver ? " over" : "")}
        onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} onClick={onPick}>
        <div style={{ width: 44, height: 44, borderRadius: 11, background: C.panel2, border: "1px solid " + C.border, display: "grid", placeItems: "center", marginBottom: 16 }}>
          <Upload size={20} color={C.accent} />
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Drop a transcript to start</div>
        <div style={{ fontSize: 12.5, color: C.mut, lineHeight: 1.55, maxWidth: 380, textAlign: "center" }}>
          A Premiere transcript export with word-level timing (segments containing words), or a word table you exported here earlier. Load the clip's audio after.
        </div>
        <div className="mono" style={{ fontSize: 10.5, color: C.mut2, marginTop: 14 }}>click to browse · or drag the file in</div>
        {error && (
          <div style={{ marginTop: 18, display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: C.accentText, background: C.accentDim, border: "1px solid " + C.accent + "55", padding: "9px 12px", borderRadius: 8, maxWidth: 420, lineHeight: 1.5 }}>
            <AlertTriangle size={14} style={{ flex: "0 0 auto", marginTop: 1 }} /> <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------- styles ------
const rootStyle = {
  display: "flex", flexDirection: "column", height: "100%", minHeight: "100dvh",
  background: C.bg, color: C.text,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  ["--bg"]: C.bg, ["--panel"]: C.panel, ["--panel2"]: C.panel2, ["--border"]: C.border,
  ["--text"]: C.text, ["--mut"]: C.mut, ["--mut2"]: C.mut2, ["--accent"]: C.accent,
  ["--accentDim"]: C.accentDim, ["--accentText"]: C.accentText, ["--ok"]: C.ok, ["--warn"]: C.warn,
  ["--wave"]: C.wave,
};
const barStyle = {
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
  padding: "10px 16px", borderBottom: "1px solid " + C.border, background: C.panel, flex: "0 0 auto",
};
const cfgStrip = {
  display: "flex", gap: 22, alignItems: "flex-start", flexWrap: "wrap",
  padding: "12px 18px", borderBottom: "1px solid " + C.border, background: C.panel2, flex: "0 0 auto",
};
const statBar = {
  display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap",
  padding: "9px 18px", borderBottom: "1px solid " + C.borderSoft, background: C.bg, flex: "0 0 auto",
};
const cardRow = {
  display: "flex", gap: 16, alignItems: "flex-start",
  padding: "14px 8px", borderBottom: "1px solid " + C.borderSoft,
};
const cardRail = { width: 56, flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" };
const qcPanel = {
  width: 340, flex: "0 0 auto", borderLeft: "1px solid " + C.border, background: C.panel,
  padding: "14px 16px", overflow: "auto",
};
const qcClean = { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.ok, background: C.okDim, border: "1px solid " + C.ok + "44", padding: "10px 12px", borderRadius: 8 };
const subRow = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "7px 0", borderBottom: "1px solid " + C.borderSoft };

const CSS = `
.cap-root *{box-sizing:border-box}
.cap-root .mono{font-family:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}
.cap-root ::-webkit-scrollbar{width:10px;height:10px}
.cap-root ::-webkit-scrollbar-thumb{background:#2b2b31;border-radius:6px;border:2px solid var(--bg)}
.cap-root ::-webkit-scrollbar-track{background:transparent}

.btn{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:550;color:var(--text);
  background:var(--panel2);border:1px solid var(--border);border-radius:7px;padding:6px 10px;cursor:pointer;
  transition:background .14s ease,border-color .14s ease,transform .06s ease;white-space:nowrap}
.btn:hover{background:#202024;border-color:#34343a}
.btn:active{transform:scale(.97)}
.btn[data-on="1"]{border-color:var(--accent);color:var(--accentText)}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn-accent{background:var(--accent);border-color:var(--accent);color:#fff}
.btn-accent:hover{background:#f25a5e;border-color:#f25a5e}
.btn-ghost{background:transparent}
.btn-sm{padding:4px 9px;font-size:11px}
.icon-btn{display:grid;place-items:center;width:24px;height:24px;border-radius:6px;background:transparent;
  border:1px solid transparent;color:var(--mut);cursor:pointer;transition:all .12s ease}
.icon-btn:hover{background:var(--panel2);color:var(--text);border-color:var(--border)}
.icon-btn:active{transform:scale(.92)}
.icon-btn:disabled{opacity:.35;cursor:not-allowed}
.icon-btn.sm{width:20px;height:20px;border-radius:5px}
.icon-btn.lg{width:30px;height:30px;border-radius:7px;color:var(--text);background:var(--panel2);border-color:var(--border)}
.icon-btn.lg:hover{background:#202024;border-color:#34343a}
.badge{display:inline-grid;place-items:center;min-width:16px;height:16px;padding:0 4px;border-radius:8px;
  background:var(--accent);color:#fff;font-size:10px;font-weight:700;line-height:1}

.tok{font-size:18px;line-height:1.5;padding:1px 5px;margin:0 1px;border-radius:5px;cursor:pointer;
  color:var(--mut);transition:background .12s ease,color .12s ease,box-shadow .12s ease;user-select:none;border:1px solid transparent}
.tok:hover{background:#202024;color:var(--text)}
.tok-top,.tok-bot{font-size:14px;color:var(--mut)}
.tok-hl{font-size:20px;font-weight:650;color:var(--accentText);background:var(--accentDim);border-color:#5a2a2c}
.tok-hl:hover{background:#48211f}
.tok-flash{animation:flash 1.3s ease}
.tok-active{box-shadow:inset 0 -2px 0 0 var(--ok),0 0 0 1px rgba(61,214,140,.5);color:var(--text)!important}
.tok-located{box-shadow:0 0 0 2px var(--accent),0 0 0 5px rgba(229,72,77,.25)!important;background:var(--accentDim)!important;color:var(--text)!important;animation:locatePulse 1.1s ease}
@keyframes locatePulse{0%{box-shadow:0 0 0 2px var(--accent),0 0 0 10px rgba(229,72,77,.45)}100%{box-shadow:0 0 0 2px var(--accent),0 0 0 5px rgba(229,72,77,.18)}}

.sub-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 8px;margin:0 -8px;
  border-bottom:1px solid var(--borderSoft,#1f1f23);cursor:pointer;border-radius:6px;transition:background .12s ease}
.sub-row:hover{background:var(--panel2)}
.sub-row.cur{background:#221012;box-shadow:inset 2px 0 0 0 var(--accent)}
.sub-card{font-size:9.5px;color:var(--mut2);background:#0a0a0b;border:1px solid var(--border);border-radius:4px;padding:1px 4px;flex:0 0 auto}
.kbd{font:600 9.5px ui-monospace,Menlo,Consolas,monospace;background:#0a0a0b;border:1px solid var(--border);
  border-bottom-width:2px;border-radius:4px;padding:0 3px;margin-left:3px;color:var(--mut)}
.kbd.lg{font-size:11px;padding:2px 6px;margin:0;color:var(--text)}

.modal-scrim{position:fixed;inset:0;background:rgba(0,0,0,.66);backdrop-filter:blur(3px);
  display:grid;place-items:center;z-index:50;padding:24px;animation:fade .14s ease}
@keyframes fade{from{opacity:0}to{opacity:1}}
.modal{width:560px;max-width:100%;max-height:86vh;display:flex;flex-direction:column;
  background:var(--panel);border:1px solid var(--border);border-radius:14px;
  box-shadow:0 30px 80px rgba(0,0,0,.6);overflow:hidden}
.modal.wide{width:680px}
.modal-head{display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:13px 16px;border-bottom:1px solid var(--border);flex:0 0 auto}
.modal-body{padding:16px;overflow:auto}

.sc-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 28px}
@media (max-width:560px){.sc-grid{grid-template-columns:1fr}}
.sc-sec{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);
  margin:12px 0 5px;padding-bottom:4px;border-bottom:1px solid var(--borderSoft,#1f1f23)}
.sc-sec:first-child{margin-top:0}
.sc-row{display:flex;align-items:center;gap:10px;padding:4px 0}
.sc-keys{flex:0 0 auto;min-width:128px}
.sc-desc{font-size:12.5px;color:var(--text)}
.sc-mouse{margin-top:16px;padding-top:12px;border-top:1px solid var(--border);
  font-size:12px;color:var(--mut);line-height:1.6}
.sc-mouse b{color:var(--text);font-weight:600}

.code-block{margin:0;background:#0a0a0b;border:1px solid var(--border);border-radius:8px;
  padding:12px;max-height:46vh;overflow:auto;font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  color:#c4c4ca;white-space:pre;tab-size:4}
@keyframes flash{0%{background:var(--ok);color:#06140d}60%{background:var(--okDim,#123026)}100%{background:transparent}}
.tok-edit{font-size:16px;padding:1px 5px;border-radius:5px;background:#000;border:1px solid var(--accent);
  color:var(--text);outline:none}

.gap-ctl{display:inline-flex;flex-direction:column;width:14px;height:24px;margin:0 1px;vertical-align:middle;justify-content:center;gap:1px}
.split-handle,.merge-handle{display:inline-grid;place-items:center;width:14px;height:11px;border:none;background:transparent;
  color:transparent;cursor:pointer;border-radius:3px;transition:color .12s ease,background .12s ease;padding:0}
.split-handle:hover{color:var(--accentText);background:#202024}
.merge-handle:hover{color:var(--ok);background:#202024}
.card-row:hover .split-handle{color:#3a3a40}
.card-row:hover .merge-handle{color:#34343a}

.num{width:62px;background:#0a0a0b;border:1px solid var(--border);border-radius:6px;color:var(--text);
  padding:5px 7px;font-size:12px;outline:none}
.num:focus{border-color:var(--accent)}
.ta{width:100%;height:130px;resize:vertical;background:#0a0a0b;border:1px solid var(--border);border-radius:8px;
  color:var(--text);padding:9px 11px;font-size:12.5px;line-height:1.5;outline:none;
  font-family:-apple-system,system-ui,sans-serif}
.ta:focus{border-color:var(--accent)}

.cap-preview{flex:0 0 auto;width:208px;min-height:74px;border:1px solid var(--border);border-radius:9px;
  background:#070708;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;
  padding:12px 10px;text-align:center;overflow:hidden}
.pv-hl{font-size:18px;font-weight:700;color:#fff;letter-spacing:-.01em;line-height:1.1;word-break:break-word}
.pv-sm{font-size:11px;color:#c4c4ca;line-height:1.15;word-break:break-word}

.dropzone{display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;
  border:1.5px dashed var(--border);border-radius:16px;padding:46px 40px;background:var(--panel);
  transition:border-color .15s ease,background .15s ease;max-width:520px}
.dropzone:hover{border-color:#3a3a40}
.dropzone.over{border-color:var(--accent);background:var(--accentDim)}

/* ---------------- timeline ---------------- */
.tl-dock{flex:0 0 auto;border-top:1px solid var(--border);background:var(--panel)}
.tl-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 12px;border-bottom:1px solid var(--borderSoft,#1f1f23)}
.tl-transport{display:flex;align-items:center;gap:10px;min-width:0}
.tl-time{font-size:12px;font-weight:600;letter-spacing:.01em}
.tl-aname{font-size:11px;color:var(--mut);display:inline-flex;align-items:center;gap:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px}
.tl-scroll{position:relative;overflow-x:auto;overflow-y:hidden;background:#070708;cursor:text}
.tl-inner{position:relative}

.tl-ruler{position:absolute;top:0;left:0;right:0;border-bottom:1px solid #161619}
.tl-tick{position:absolute;top:0;height:100%;border-left:1px solid #1c1c20}
.tl-tick-label{position:absolute;left:4px;top:3px;font-size:9.5px;color:var(--mut2)}

.tl-wave{position:absolute;top:${LANES.ruler}px;left:0;right:0;overflow:hidden}
.tl-wave-canvas{position:absolute;top:0;left:0;display:block}
.tl-wave-mid{position:absolute;top:50%;left:0;right:0;height:1px;background:#141417}
.tl-wave-empty{position:sticky;left:0;display:inline-block;padding:6px 10px;font-size:10.5px;color:var(--mut2)}

.tl-words{position:absolute;top:${LANES.ruler + LANES.wave}px;left:0;right:0;border-top:1px solid #161619;border-bottom:1px solid #161619}
.tl-card-span{position:absolute;top:1px;height:11px;border-left:1px solid #2e2e34;border-right:1px solid #2e2e34;border-top:1px solid #2e2e34;border-radius:3px 3px 0 0}
.tl-card-id{position:absolute;left:3px;top:-1px;font-size:8.5px;color:var(--mut2);line-height:1}
.tl-blk{position:absolute;top:15px;height:25px;border-radius:4px;overflow:hidden;display:flex;align-items:center;
  background:#202026;border:1px solid #2c2c33}
.tl-blk.alt{background:#1b1b21}
.tl-blk-t{font-size:10px;color:#b8b8c0;padding:0 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tl-blk-hl{background:var(--accentDim);border-color:#5a2a2c}
.tl-blk-hl .tl-blk-t{color:var(--accentText);font-weight:600}

.tl-script{position:absolute;top:${LANES.ruler + LANES.wave + LANES.words}px;left:0;right:0;border-bottom:1px solid #161619}
.tl-scell{position:absolute;top:4px;height:18px;border-radius:3px;display:flex;align-items:center;overflow:hidden}
.tl-scell span{font-size:9.5px;padding:0 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tl-scell-match span{color:var(--mut)}
.tl-scell-sub{background:#2a1416;border:1px solid #5a2a2c}
.tl-scell-sub span{color:var(--accentText);font-weight:600}
.tl-scell-del span{color:var(--mut2)}
.tl-ins{position:absolute;top:2px;height:22px;width:0;border-left:2px solid var(--accent)}
.tl-ins-mark{position:absolute;left:-5px;top:-1px;font-size:9px;color:var(--accent)}
.tl-script-empty{position:sticky;left:0;display:inline-block;padding:5px 10px;font-size:10px;color:var(--mut2)}

.tl-playhead{position:absolute;top:0;bottom:0;width:0;border-left:1.5px solid var(--ok);pointer-events:none;z-index:6}
.tl-playhead-knob{position:absolute;top:0;left:-4px;width:8px;height:8px;border-radius:0 0 4px 4px;background:var(--ok)}
.tl-active{position:absolute;background:rgba(61,214,140,.10);border:1px solid rgba(61,214,140,.5);border-radius:4px;pointer-events:none;z-index:5}

:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media (prefers-reduced-motion:reduce){.cap-root *{transition:none!important;animation:none!important}}
@media (max-width:760px){
  .cap-preview{display:none}
  aside{position:fixed;inset:49px 0 0 auto;width:100%!important;max-width:360px;z-index:20;box-shadow:-20px 0 60px rgba(0,0,0,.5)}
}
`;
