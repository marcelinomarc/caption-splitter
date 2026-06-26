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
  Eraser, SplitSquareHorizontal, ScanLine,
  GripVertical, Video, Save, FolderOpen, Trash2, History, HardDriveDownload,
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
const LOGO_SRC = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEUAAABICAYAAACgEzj3AAAOmklEQVR42t1cfWgdVZ9+zsfcubk3N8lNmq2pC0shNi0rVf8TXHG3FD+iDXFtEayURUwT2pqaVE0UKrhYEE21LMSvpqAsSy1So/lq0kQt6kJqsSsv+FXdF/rihW01bb7vx9xzzv7RO+NkMnNn5qZ97evA4d4798yZ83vO8/s4v3NmCPwP4vj8Wz5UoQQS2O08KzQg8Mc67LJJN5DcQGF2IAghWLduXWJqaqpcCMEppXEpJQNAlVLXLXsIIZIQIimleSnlAuc8H4lEZlOpVFqpJTjQAjieoFAAsqamZs3i4uK/SinvUko1KKVqASSUUgyATgj5m1ElpZQEkCWE5AFME0L+j1L6J8bYyVWrVg2cP38+4ySCkyGIx+NPaJo2RSlVhBBl08M/TCGEKEqp0jTtm3g8/s82QiwHJBaLPcMYMy82AOQLCEpH+V0FClpsdsMsolCMQlGc82x5efk/2XGwEEomkzdzzqUNiOtiRK92cdwjVwDm+/r6er1gTgg1QUmn07uFEKRQmf7ORhLXymw52tYACCllQyqVuteUnQIQ27ZtY0KIf1FXzDIN03jYEqStMAKWCqKtvlJKKSHEfeZfHID65JNPViul/sEvQLsao7eSNtyutZ9z/u9wva7XKqVIoWwsnBYUAAzDWKOUihboQ/6adA7DyGuhhmZ4IaW84a677uIAFAcAIUSVLQwmpY6sV12/EQvDpiD9cd7PvMajH6RQp/Lrr79OALjMCyjFCheoMB0IClhQsFYKhh8IBXXxUqNIPp/XAIADAKU08deyC6WAbhcm6L2VUq7geAEDQNN1PbKwsHAFFKVUxKY+RW/uZ+zC0DoMYKZ9CNqGE0g/YAghXAgRsZgihKBhwHDrsNcoedXzEs4PYEr9IwYp5bJ7OVnj/G16IQuUUl2xl+A+hi20CppABGUJpXQZM+zgeNgVWpjwWqAEHjm7nl9rD+Rsy40llFKrnpQSUspl6uZUIw9grBMmKCqIvroB4hephg2s/FRzySyWMSwuLi6pG41GIYQI5HXM/6SUsOeGaNAOOQHxCqoopdboFQu8/KYB9t/OOpRScM6xuLiI5uZmDAwMoK+vDxs2bEA6nQZjzDP481FbYgeFhKW2G0CMMRiGAcMwlnQsCAheArgVzjkWFhbw9NNPo7+/H7FYDHfeeSe++OILrFu3DrlcDoyxQINs+23lb2lBF0kQ6nudM+mZTqdRXV2NyspKLC4uLtF3P0Z4nXNezznH3Nwc9u3bh5dffhktLS3YvHkzGhoakE6nsWvXLgghrEEp1ncv9aJh2eEFiKZpOHLkCFKpFH7++WccOHAA6XQalFJr1EqZUdt/a5pmAdLT04OWlhb09fUhGo0CAM6dO4e6urow8x7X8zxsFGp6ALNBxhgWFhbw4osvYseOHdixYweSySR6e3uRTCaxa9cuxOPxUIGX2whzzjEzM4POzk709PRg586d6Ovrg6ZpMAzDAs1pZIsFdV4Hd7qjYq7R7tKcN3jooYdw6NAhHD16FADw448/4uTJk1BKYffu3UgkEsvco5cXcrKSUoqZmRl0dHTg4MGDaG1txeHDhy1AGGNW226Mdotsnd8JIUQpRe2g0DDBmtv/UkosLCyAMQZd1zE+Po577rkHY2NjUEphz549SCQSSzrjFfna78cYw+zsLPbu3YtXX30VbW1tePvtt8E5h2EYy9x8kQlfYOaEVh/z5na3ax9RIQRyuRw45zh58iTuvfdejI6OAgD27NmDioqKQICYqppOp7F+/XocOnQInZ2deOuttyyGuA2Mk4l2dpuBnZdYhBDpC4qXxQ4SoufzeWiahrGxMdx33304ceIElFJ44oknUFlZuWxU3cJyxhhyuRxuvfVWzM/Po7e3F5RS5PN5zzlPMcGdLPWzKSVnw4rNdQzDAOcco6OjaGxsxMjICJRSaG9vR1VVlauN8RI2n88jGo1idnbWs66dKQFTkUtOOW1KKLYEob6dMZxznDhxAvfffz+Gh4cBAO3t7Ugmk1BKuY6uE3S7wMXAM+u4zZO8bI5NJhmaKSYYQec+TlUaGRnBAw88gKGhISilsHfvXlRXV3saX3scFBQUE2Bne06vc83Ux20UvAAyDAOapmF4eBhbtmzB4OAglFJ48sknUV1d7QmI+dsv/nAywS0pFcAL0cCgeIFgpyjnHJFIZNl5NxszNDSEpqYmDAwMQEqJzs5O1NTUuI5gGFCEEMuY4mShVzbOrj7UzDqVkjc1PYSUEuPj42hra8OaNWusCVkxGzM4OIimpiZ0dHTglVdewaVLl8AYc50SmKoRJOPmzKcUWzTzkpUGXAYoGrSVl5eju7sb58+fx+nTp7FmzZolkzI/YJ566im89NJLmJqack09KKUCMSWI93FjjScoQeclTh2VUoJzjnQ6jc2bN+Py5cuYnJxEXV1dKGCeeeYZHDhwwBWYoEyxe7IgjHepQ+ypg8BrL15sKSsrQyaTwaZNmzA9PY3JyUnccMMNoYDp7u7GCy+8gEuXLi0BJqhNCeKhih3ZbPY3pgTJkPuxSQiBsrIyizHz8/P48ssvsXr16sDAbNmyBc8++yyef/55TE1NLXPJYWyKl8oUO3RdhytTVrKgpZRCIpHA3Nwc7rjjDkxNTeH06dOBGWN6pe7ubjz33HOWKoVhil2WsKzJZrMqVJLJS4XsXmhxcREXLlxAbW0tamtrsXXrVqRSKUxMTARmzPDwMB588EF0d3ejq6sLCwsLvobRy9CGSYLbbSwNqzbOjimlwBjD9PQ0NmzYgMHBQXzzzTf47rvvcObMGVBKUV9fj7GxsVDAbNu2DV1dXWhvb8fMzMyyBa5SJoR+uZtIJBI8HelUkSX5TEoxOzuLxsZGnDlzBnV1dWhvb8emTZuwe/duTE1NAQA2btyIkZER1NbWBgbm4YcfRmdnJx599FHMzMx42j6zP26g+DGs2H9thT1hBqVUmYUxpjjnStM0FYlElK7rKhqNqrKyMhWLxVQikVC6rqu1a9eqTCaj3nzzTde9ax0dHWp+fl7Nzc2ps2fPqlWrVikAyrbpcFnRNE0BUK2trerixYvq1KlTKpFIWHvh7HUppQqAevfdd1VPT48CoCoqKlQsFlPRaFRFo1Gl67rSNE1pmqY451ZhjElT1kgksn7F3odSimw2i3379uGXX35BW1ublSs112Y453jttdfw2Wef4fPPP8f8/Dw+/fRTJJNJCCF873358mVftSimPk7752OXVGDvY5/s2eloqsHdd9+NY8eOWQbXMAwrB2J25r333kN9fT22b9+ObDaLiYkJVFVVQUq5TJXMNm677Tbs378fk5OTK/I+bgksD9UhrjYlTGRrRrPxeBypVMozhwEAqVTKSl43NjZCKYXR0VFUVVUtYQxjDEII3HLLLejv78eHH36I119/HfF43Hfw3MJ8v7DeDbjQLtlpZHO5HC5cuID169e7eghzB0B9fT1mZmaQy+WQTqfR1NQEQgiGhoZQWVkJKSUikQiEENi4cSM++OADDAwMYP/+/YhEIoHVpxijgibGaND8hFtUaarTsWPHsH37diQSCStvwhhbknFvbW3Fxx9/jF9//dUK8Jqbm0EpxUcffYRkMmnlY48fP47BwUF0d3cjGo1a4Juq5lYIIa7JbKcMbuHFMltZSvBmNi6EQDQaxRtvvIFUKoXR0VHU1NTAMAwIIZDP56HrOt555x2sXr0aBw8eRDweRyaTsfKtW7duhVIKExMT6O3txfHjxzE0NISuri7EYjEQQjA3N4d4PI5YLGa1K4SwimEYUEqhtrYW8/PzgUyBM7hbYndsLvkNXNmCzr1yEG5LmowxZLNZrF27Fv39/bjxxhtx9OhR/PTTT6irq0NzczM453jkkUdw9uxZlJeXW7rPGEMmk0E8Hsdjjz2GhoYGnDp1Cu+//z50XbeWTCil6O3tha7r1qqAc6Z+88034/bbb8fjjz+OH374AbquW4bejSm2T6WUIoV16g25XO57X1CcwNiXTe27DdLpNOLxOFpaWtDU1ITq6mpMT09jfHwchw8fttTGqfPmksXc3JxlaO2LZoQQ5HI51NTUYOfOnbjppptc1Xh6ehpHjhzBV199hbKyMgghPFXH8blyULyYY45qJpOxQmaT1mVlZdB1HUIIz70q9i1cbkIbhoF0Og1N05YJZ/5PKV0CSDGW2Ni2DBReivdxy9JJKUEpXbJmbKqAPWbxyq6bKuVcrzbbZoyhoqJiWc7E/G7OW/wA8TOZRRPXQXYUuiV/TbdMCLEModfWLrelTC+PYG+7iCr4AhIEIF4KK4LsNnReG2a5wS8W8Zu9+7lgv2C15AV25+K115KC2xaOUhJAbgK7MdWLEW4M8eoDL8WGhNn7HnRRu1SAvEbfjyFeRLRAoZTKMIGOaVSDJG+uNhClJMK8bJTjtySECDtTjDCMcQOm2I1Xsp8/SArDD4SAamM+eGmBkikITcIC4yVw2JErtlM77BNfxdS1yLVGtrDGYT7vs1DKIyNebAiiMmEEDdJeAPXwbWKJTWGMzRZcHQlD31K9SanuuNR1qYD3misUC5SLUsrQj96GfTBppe74aoHkwhAC4BKAtJU6yOVyKQCX7XnKUlyjnwoEqXe13HRYNwzgz4XvzHxYewbAn/Db4+9XpVPFOuhVL+j1Xm2sYKXzv82v1hPshJD/hMtrM66X42oC4FQdQojgnB83mUMLvplKKf+LEPI/uPKoe+56BedqYYzfXgTBCCH/kcvlzuHKCyCspzcoAKnr+lrDMAaVUv9oa0CUYmeu48N80445mz/W0NCw49tvv83D5fVEFACqq6srGGP/Tgg5dy3eSnE9FEpphhAyqWnavzlzKW5xid2mRDRNWy+lrCeE/L0Q4u8AlBXceJRSaiLOXJikEP7FVsTWDnF4QmJrU7nUd6YXBKVUSimF6WYJITMALhJC/sI5/z6bzf6vx72K0+sPfnjKSXwuIvid36VyjY6iocf/A3saDLZoT3VyAAAAAElFTkSuQmCC";

// The downstream After Effects script (CaptionBuilder.jsx) that consumes the
// exported captions JSON. Embedded as base64 and decoded (UTF-8 safe) so users
// can copy or download it straight from the app.
const CAPTION_BUILDER_B64 = "Ly8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PQ0KLy8gQ2FwdGlvbkJ1aWxkZXIuanN4ICDigJQgIEFmdGVyIEVmZmVjdHMgY2FwdGlvbiBidWlsZGVyDQovLyBQZXItcm93LXRpbWVkIHN0YWNrZWQgY2FwdGlvbnMgZnJvbSBhIGNhcHRpb25zIEpTT04uDQovLyBFUzMgLyBFeHRlbmRTY3JpcHQuIE9wZW4gYSBjb21wLCBydW4sIHBpY2sgdGhlIGNhcHRpb25zIEpTT04uDQovLw0KLy8gPj4+IEZPTlQgU0VUVVAgKGRvIHRoaXMgb25jZSwgZml4ZXMgYWxsIHRoZSBzdWJzdGl0dXRpb24gcHJvYmxlbXMpIDw8PA0KLy8gTmFtZS1iYXNlZCBmb250IHNldHRpbmcgaXMgdW5yZWxpYWJsZSBvbiB0aGlzIEFFLCBzbyB0aGUgc2NyaXB0IGNvcGllcyBmb250cw0KLy8gZnJvbSB0d28gcmVmZXJlbmNlIGxheWVycyB5b3UgbWFrZSBieSBoYW5kOg0KLy8gICAxLiBNYWtlIGEgdGV4dCBsYXllciwgc2V0IGl0IHRvIHlvdXIgSElHSExJR0hUIGZvbnQgaW4gdGhlIENoYXJhY3RlciBwYW5lbA0KLy8gICAgICAoRXVyb3BhIEdyb3Rlc2sgU0gpLCBuYW1lIGl0IGV4YWN0bHkgIFJFRl9ITA0KLy8gICAyLiBNYWtlIGEgdGV4dCBsYXllciwgc2V0IGl0IHRvIHlvdXIgU01BTEwgZm9udCAoSW50ZXIsIExpZ2h0KSwNCi8vICAgICAgbmFtZSBpdCBleGFjdGx5ICBSRUZfU00NCi8vICAgMy4gTGVhdmUgYm90aCBpbiB0aGUgY29tcCBhbmQgcnVuLiBUaGUgc2NyaXB0IGR1cGxpY2F0ZXMgdGhlbSBwZXIgcm93IGFuZA0KLy8gICAgICBvbmx5IGNoYW5nZXMgdGhlIHRleHQgKyBzaXplIC0+IHRoZSBmb250IGlzIG5ldmVyIHJlLXJlc29sdmVkLCBzbyBpdA0KLy8gICAgICBjYW4ndCBkcmlmdCB0byBUYWN0aWMgLyBJbnRlciBSZWd1bGFyLiBUaGUgUkVGIGxheWVycyBhcmUgYXV0by1kaXNhYmxlZA0KLy8gICAgICBhZnRlciB0aGUgYnVpbGQgKGRlbGV0ZSB0aGVtIHdoZW5ldmVyKS4NCi8vIElmIGEgUkVGIGxheWVyIGlzIG1pc3NpbmcgaXQgZmFsbHMgYmFjayB0byBzZXR0aW5nIHRoZSBmb250IGJ5IG5hbWUgKGZsYWt5KS4NCi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0NCg0KLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSBMQVlPVVQgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLQ0KdmFyIFNJWkVfSEwgICA9IDE2MDsNCnZhciBTSVpFX1NNICAgPSA1NTsNCnZhciBST1dfR0FQICAgPSAyMDsNCnZhciBZX0FOQ0hPUiAgPSAwLjU7ICAgICAgICAgIC8vIDAuNSA9IGNlbnRyZSwgMC43OCA9IGxvd2VyLXRoaXJkDQoNCi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gRk9OVFMgKHJlZmVyZW5jZSBsYXllcnMpIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0NCnZhciBGT05UX0hMX1JFRiA9ICJSRUZfSEwiOyAgIC8vIHRleHQgbGF5ZXIgc2V0IHRvIHRoZSBoaWdobGlnaHQgZm9udCBieSBoYW5kDQp2YXIgRk9OVF9TTV9SRUYgPSAiUkVGX1NNIjsgICAvLyB0ZXh0IGxheWVyIHNldCB0byB0aGUgc21hbGwgZm9udCAoSW50ZXIgTGlnaHQpIGJ5IGhhbmQNCg0KLy8gRmFsbGJhY2sgT05MWSBpZiBhIFJFRiBsYXllciBhYm92ZSBpcyBub3QgZm91bmQgKG5hbWUtYmFzZWQsIG1heSBzdWJzdGl0dXRlKToNCnZhciBGT05UX0hMICAgPSB7IGZhbWlseTogIkV1cm9wYSBHcm90ZXNrIFNIIiwgc3R5bGU6ICIiIH07DQp2YXIgRk9OVF9TTSAgID0geyBmYW1pbHk6ICJJbnRlciIsICAgICAgICAgICAgIHN0eWxlOiAiTGlnaHQiIH07DQoNCi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gQ0FTSU5HIC8gQ09MT1VSIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0NCnZhciBITF9DQVNFICAgPSAiYXNpcyI7ICAgICAgIC8vIFdZU0lXWUc6IGVtaXQgZXhhY3RseSB3aGF0IHRoZSBlZGl0b3IgdHlwZWQuIChhc2lzIHwgc2VudGVuY2UgfCBsb3dlciB8IHVwcGVyIHwgdGl0bGUpDQp2YXIgU01fQ0FTRSAgID0gImFzaXMiOyAgICAgICAvLyAiYXNpcyIgfCAibG93ZXIiIHwgInVwcGVyIg0KdmFyIENPTE9SX0hMICA9IFsxLCAxLCAxXTsNCnZhciBDT0xPUl9TTSAgPSBbMSwgMSwgMV07DQoNCi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gVElNSU5HIChmbGF0LXNjaGVtYSBmYWxsYmFjaykgLS0tLS0tLS0tLS0tLS0tLS0NCi8vIFBlci1yb3cgSlNPTiAob2JqZWN0cyB3aXRoIGluL291dCkgaXMgYXBwbGllZCB2ZXJiYXRpbS4gVGhlc2Ugb25seSBhcHBseSB0bw0KLy8gdGhlIE9MRCBmbGF0IHNjaGVtYSB3aGVyZSBoaWdobGlnaHQgaXMgYSBwbGFpbiBzdHJpbmcuDQp2YXIgSE9MRF9UT19ORVhUID0gZmFsc2U7DQp2YXIgVEFJTF9QQUQgICAgID0gMC4zMDsNCnZhciBNQVhfSE9MRCAgICAgPSAwOw0KDQp2YXIgTE9HX0ZPTlRTID0gZmFsc2U7ICAgICAgICAvLyB0cnVlOiBidWlsZCBjYXJkIDEgb25seSwgYWxlcnQgcmVzb2x2ZWQgZm9udHMsIHN0b3AuDQovLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tDQoNCg0KKGZ1bmN0aW9uICgpIHsNCiAgICB2YXIgY29tcCA9IGFwcC5wcm9qZWN0LmFjdGl2ZUl0ZW07DQogICAgaWYgKCEoY29tcCAmJiBjb21wIGluc3RhbmNlb2YgQ29tcEl0ZW0pKSB7IGFsZXJ0KCJPcGVuIGEgY29tcCBmaXJzdC4iKTsgcmV0dXJuOyB9DQoNCiAgICB2YXIgZiA9IEZpbGUub3BlbkRpYWxvZygiU2VsZWN0IGNhcHRpb25zIEpTT04iLCAiKi5qc29uIik7DQogICAgaWYgKCFmKSB7IHJldHVybjsgfQ0KICAgIGYuZW5jb2RpbmcgPSAiVVRGLTgiOw0KICAgIGYub3BlbigiciIpOyB2YXIgdHh0ID0gZi5yZWFkKCk7IGYuY2xvc2UoKTsNCiAgICBpZiAodHh0LmNoYXJDb2RlQXQoMCkgPT09IDB4RkVGRikgdHh0ID0gdHh0LnN1YnN0cmluZygxKTsNCg0KICAgIHZhciBjYXJkczsNCiAgICB0cnkgeyBjYXJkcyA9IGV2YWwoIigiICsgdHh0ICsgIikiKTsgfQ0KICAgIGNhdGNoIChlKSB7IGFsZXJ0KCJDb3VsZG4ndCBwYXJzZSBKU09OOlxuIiArIGUudG9TdHJpbmcoKSk7IHJldHVybjsgfQ0KICAgIGlmICghKGNhcmRzICYmIGNhcmRzLmxlbmd0aCkpIHsgYWxlcnQoIk5vIGNhcmRzIGluIEpTT04uIik7IHJldHVybjsgfQ0KDQogICAgZnVuY3Rpb24gdGMyc2VjKHRjKSB7DQogICAgICAgIHZhciBwID0gU3RyaW5nKHRjKS5zcGxpdCgiLCIpOw0KICAgICAgICB2YXIgaG1zID0gcFswXS5zcGxpdCgiOiIpOw0KICAgICAgICB2YXIgbXMgPSAocC5sZW5ndGggPiAxKSA/IHBhcnNlSW50KHBbMV0sIDEwKSA6IDA7DQogICAgICAgIHJldHVybiBwYXJzZUludChobXNbMF0sIDEwKSAqIDM2MDAgKyBwYXJzZUludChobXNbMV0sIDEwKSAqIDYwICsgcGFyc2VJbnQoaG1zWzJdLCAxMCkgKyBtcyAvIDEwMDA7DQogICAgfQ0KICAgIGZ1bmN0aW9uIGhhcyh2KSB7IHJldHVybiB2ICE9IG51bGwgJiYgU3RyaW5nKHYpICE9PSAiIjsgfQ0KICAgIGZ1bmN0aW9uIHJlY2FzZUhMKHcsIGxlYWRzKSB7DQogICAgICAgIGlmIChITF9DQVNFID09PSAiYXNpcyIpIHJldHVybiB3Ow0KICAgICAgICBpZiAoSExfQ0FTRSA9PT0gInVwcGVyIikgcmV0dXJuIHcudG9VcHBlckNhc2UoKTsNCiAgICAgICAgaWYgKEhMX0NBU0UgPT09ICJsb3dlciIpIHJldHVybiB3LnRvTG93ZXJDYXNlKCk7DQogICAgICAgIGlmIChITF9DQVNFID09PSAidGl0bGUiKSByZXR1cm4gdy50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL1xiW2Etel0vZywgZnVuY3Rpb24gKGMpIHsgcmV0dXJuIGMudG9VcHBlckNhc2UoKTsgfSk7DQogICAgICAgIHZhciBzID0gdy50b0xvd2VyQ2FzZSgpOw0KICAgICAgICBpZiAobGVhZHMgJiYgcy5sZW5ndGgpIHMgPSBzLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgcy5zdWJzdHJpbmcoMSk7DQogICAgICAgIHJldHVybiBzOw0KICAgIH0NCiAgICBmdW5jdGlvbiByZWNhc2VTTSh3KSB7DQogICAgICAgIGlmIChTTV9DQVNFID09PSAibG93ZXIiKSByZXR1cm4gdy50b0xvd2VyQ2FzZSgpOw0KICAgICAgICBpZiAoU01fQ0FTRSA9PT0gInVwcGVyIikgcmV0dXJuIHcudG9VcHBlckNhc2UoKTsNCiAgICAgICAgcmV0dXJuIHc7DQogICAgfQ0KICAgIGZ1bmN0aW9uIGdldFJlZkxheWVyKG5hbWUpIHsNCiAgICAgICAgaWYgKCFuYW1lKSByZXR1cm4gbnVsbDsNCiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPD0gY29tcC5udW1MYXllcnM7IGkrKykgew0KICAgICAgICAgICAgdmFyIEwgPSBjb21wLmxheWVyKGkpOw0KICAgICAgICAgICAgaWYgKEwubmFtZSA9PT0gbmFtZSAmJiBMLnByb3BlcnR5KCJBREJFIFRleHQgUHJvcGVydGllcyIpKSByZXR1cm4gTDsNCiAgICAgICAgfQ0KICAgICAgICByZXR1cm4gbnVsbDsNCiAgICB9DQogICAgdmFyIHJlZkhMID0gZ2V0UmVmTGF5ZXIoRk9OVF9ITF9SRUYpOw0KICAgIHZhciByZWZTTSA9IGdldFJlZkxheWVyKEZPTlRfU01fUkVGKTsNCiAgICB2YXIgdXNlZFJlZnMgPSBbXTsNCiAgICBpZiAocmVmSEwpIHVzZWRSZWZzLnB1c2gocmVmSEwpOw0KICAgIGlmIChyZWZTTSkgdXNlZFJlZnMucHVzaChyZWZTTSk7DQoNCiAgICBmdW5jdGlvbiBwYXJzZUZpZWxkKGZpZWxkLCBmYkluLCBmYk91dCkgew0KICAgICAgICBpZiAoZmllbGQgPT0gbnVsbCkgcmV0dXJuIG51bGw7DQogICAgICAgIGlmICh0eXBlb2YgZmllbGQgPT09ICJzdHJpbmciKSB7DQogICAgICAgICAgICBpZiAoZmllbGQgPT09ICIiKSByZXR1cm4gbnVsbDsNCiAgICAgICAgICAgIHJldHVybiB7IHRleHQ6IGZpZWxkLCBpblNlYzogZmJJbiwgb3V0U2VjOiBmYk91dCB9Ow0KICAgICAgICB9DQogICAgICAgIGlmICghaGFzKGZpZWxkLnRleHQpKSByZXR1cm4gbnVsbDsNCiAgICAgICAgcmV0dXJuIHsNCiAgICAgICAgICAgIHRleHQ6IGZpZWxkLnRleHQsDQogICAgICAgICAgICBpblNlYzogIGhhcyhmaWVsZFsiaW4iXSkgID8gdGMyc2VjKGZpZWxkWyJpbiJdKSAgOiBmYkluLA0KICAgICAgICAgICAgb3V0U2VjOiBoYXMoZmllbGRbIm91dCJdKSA/IHRjMnNlYyhmaWVsZFsib3V0Il0pIDogZmJPdXQNCiAgICAgICAgfTsNCiAgICB9DQoNCiAgICAvLyBCdWlsZCBhIHN0eWxlZCB0ZXh0IGxheWVyLiBJZiByZWZMYXllciBpcyBnaXZlbiwgRFVQTElDQVRFIGl0IChmb250IGNvcGllZA0KICAgIC8vIHZlcmJhdGltLCBuZXZlciByZS1yZXNvbHZlZCkuIEVsc2UgY3JlYXRlIGZyZXNoIGFuZCBzZXQgZm9udCBieSBuYW1lK3N0eWxlLA0KICAgIC8vIHZlcmlmeWluZyBCT1RIIGZhbWlseSBhbmQgc3R5bGUgb24gcmVhZGJhY2suDQogICAgZnVuY3Rpb24gbWFrZVJvdyhzdHIsIHNpemUsIGNvbG9yLCBmb250U3BlYywgcmVmTGF5ZXIsIG5hbWUsIG1lYXN1cmVUKSB7DQogICAgICAgIHZhciB0bCwgdHAsIGRvYywgYXBwbGllZCwgZ290Ow0KDQogICAgICAgIGlmIChyZWZMYXllcikgew0KICAgICAgICAgICAgdGwgPSByZWZMYXllci5kdXBsaWNhdGUoKTsNCiAgICAgICAgICAgIHRsLmVuYWJsZWQgPSB0cnVlOw0KICAgICAgICAgICAgdHAgPSB0bC5wcm9wZXJ0eSgiQURCRSBUZXh0IFByb3BlcnRpZXMiKS5wcm9wZXJ0eSgiQURCRSBUZXh0IERvY3VtZW50Iik7DQogICAgICAgICAgICBkb2MgPSB0cC52YWx1ZTsNCiAgICAgICAgICAgIGRvYy50ZXh0ID0gc3RyOw0KICAgICAgICAgICAgZG9jLmZvbnRTaXplID0gc2l6ZTsNCiAgICAgICAgICAgIGRvYy5hcHBseUZpbGwgPSB0cnVlOw0KICAgICAgICAgICAgZG9jLmZpbGxDb2xvciA9IGNvbG9yOw0KICAgICAgICAgICAgZG9jLmp1c3RpZmljYXRpb24gPSBQYXJhZ3JhcGhKdXN0aWZpY2F0aW9uLkNFTlRFUl9KVVNUSUZZOw0KICAgICAgICAgICAgdHAuc2V0VmFsdWUoZG9jKTsgICAgICAgICAgICAgICAgICAgICAgIC8vIGZvbnQgdW50b3VjaGVkIC0+IHN0YXlzIHJlc29sdmVkDQogICAgICAgICAgICBnb3QgPSBTdHJpbmcodHAudmFsdWUuZm9udEZhbWlseSkgKyAiIC8gIiArIFN0cmluZyh0cC52YWx1ZS5mb250U3R5bGUpOw0KICAgICAgICAgICAgYXBwbGllZCA9IHRydWU7DQogICAgICAgIH0gZWxzZSB7DQogICAgICAgICAgICB0bCA9IGNvbXAubGF5ZXJzLmFkZFRleHQoc3RyKTsNCiAgICAgICAgICAgIHRwID0gdGwucHJvcGVydHkoIkFEQkUgVGV4dCBQcm9wZXJ0aWVzIikucHJvcGVydHkoIkFEQkUgVGV4dCBEb2N1bWVudCIpOw0KICAgICAgICAgICAgdmFyIHdhbnRGID0gU3RyaW5nKGZvbnRTcGVjLmZhbWlseSk7DQogICAgICAgICAgICB2YXIgd2FudFMgPSAoZm9udFNwZWMuc3R5bGUgfHwgIiIpOw0KICAgICAgICAgICAgZm9yICh2YXIgYSA9IDA7IGEgPCA2OyBhKyspIHsNCiAgICAgICAgICAgICAgICBkb2MgPSB0cC52YWx1ZTsNCiAgICAgICAgICAgICAgICBkb2MuZm9udFNpemUgPSBzaXplOyBkb2MuYXBwbHlGaWxsID0gdHJ1ZTsgZG9jLmZpbGxDb2xvciA9IGNvbG9yOw0KICAgICAgICAgICAgICAgIGRvYy5qdXN0aWZpY2F0aW9uID0gUGFyYWdyYXBoSnVzdGlmaWNhdGlvbi5DRU5URVJfSlVTVElGWTsNCiAgICAgICAgICAgICAgICB0cnkgeyBkb2MuZm9udEZhbWlseSA9IHdhbnRGOyBpZiAod2FudFMubGVuZ3RoKSBkb2MuZm9udFN0eWxlID0gd2FudFM7IH0NCiAgICAgICAgICAgICAgICBjYXRjaCAoZSkgeyB0cnkgeyBkb2MuZm9udCA9IHdhbnRGOyB9IGNhdGNoIChlMikge30gfQ0KICAgICAgICAgICAgICAgIHRwLnNldFZhbHVlKGRvYyk7DQogICAgICAgICAgICAgICAgdmFyIG9rRiA9IChTdHJpbmcodHAudmFsdWUuZm9udEZhbWlseSkgPT09IHdhbnRGKTsNCiAgICAgICAgICAgICAgICB2YXIgb2tTID0gKCF3YW50Uy5sZW5ndGgpIHx8IChTdHJpbmcodHAudmFsdWUuZm9udFN0eWxlKSA9PT0gd2FudFMpOw0KICAgICAgICAgICAgICAgIGlmIChva0YgJiYgb2tTKSBicmVhazsgICAgICAgICAgICAgIC8vIHZlcmlmeSBmYW1pbHkgQU5EIHN0eWxlDQogICAgICAgICAgICB9DQogICAgICAgICAgICBnb3QgPSBTdHJpbmcodHAudmFsdWUuZm9udEZhbWlseSkgKyAiIC8gIiArIFN0cmluZyh0cC52YWx1ZS5mb250U3R5bGUpOw0KICAgICAgICAgICAgYXBwbGllZCA9IChTdHJpbmcodHAudmFsdWUuZm9udEZhbWlseSkgPT09IHdhbnRGKSAmJg0KICAgICAgICAgICAgICAgICAgICAgICghd2FudFMubGVuZ3RoIHx8IFN0cmluZyh0cC52YWx1ZS5mb250U3R5bGUpID09PSB3YW50Uyk7DQogICAgICAgIH0NCg0KICAgICAgICB0bC5uYW1lID0gbmFtZTsNCiAgICAgICAgdmFyIHIgPSB0bC5zb3VyY2VSZWN0QXRUaW1lKG1lYXN1cmVULCBmYWxzZSk7DQogICAgICAgIHRsLnByb3BlcnR5KCJBREJFIFRyYW5zZm9ybSBHcm91cCIpLnByb3BlcnR5KCJBREJFIEFuY2hvciBQb2ludCIpDQogICAgICAgICAgLnNldFZhbHVlKFtyLmxlZnQgKyByLndpZHRoIC8gMiwgci50b3AgKyByLmhlaWdodCAvIDJdKTsNCiAgICAgICAgcmV0dXJuIHsgbGF5ZXI6IHRsLCBoOiByLmhlaWdodCwgYXBwbGllZDogYXBwbGllZCwgZ290OiBnb3QgfTsNCiAgICB9DQoNCiAgICB2YXIgc3RhcnRzID0gW107DQogICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjYXJkcy5sZW5ndGg7IGkrKykgc3RhcnRzW2ldID0gdGMyc2VjKGNhcmRzW2ldLnN0YXJ0KTsNCg0KICAgIHZhciBjeCA9IGNvbXAud2lkdGggLyAyLCBjeSA9IGNvbXAuaGVpZ2h0ICogWV9BTkNIT1I7DQogICAgYXBwLmJlZ2luVW5kb0dyb3VwKCJCdWlsZCBDYXB0aW9ucyIpOw0KICAgIHZhciBmYWlsZWRGb250cyA9IDAsIGxvZ0xpbmVzID0gW107DQoNCiAgICBmb3IgKHZhciBjID0gMDsgYyA8IGNhcmRzLmxlbmd0aDsgYysrKSB7DQogICAgICAgIHZhciBjYXJkID0gY2FyZHNbY107DQoNCiAgICAgICAgdmFyIGZiSW4gPSB0YzJzZWMoY2FyZC5zdGFydCk7DQogICAgICAgIHZhciBlbmRTZWMgPSBoYXMoY2FyZC5lbmQpID8gdGMyc2VjKGNhcmQuZW5kKSA6IGZiSW4gKyAwLjU7DQogICAgICAgIHZhciBuZXh0U3RhcnQgPSAoYyA8IGNhcmRzLmxlbmd0aCAtIDEpID8gc3RhcnRzW2MgKyAxXSA6IG51bGw7DQogICAgICAgIHZhciBmYk91dDsNCiAgICAgICAgaWYgKEhPTERfVE9fTkVYVCkgew0KICAgICAgICAgICAgZmJPdXQgPSAobmV4dFN0YXJ0ICE9IG51bGwpID8gbmV4dFN0YXJ0IDogZW5kU2VjOw0KICAgICAgICAgICAgaWYgKE1BWF9IT0xEID4gMCkgZmJPdXQgPSBNYXRoLm1pbihmYk91dCwgZW5kU2VjICsgTUFYX0hPTEQpOw0KICAgICAgICB9IGVsc2Ugew0KICAgICAgICAgICAgZmJPdXQgPSBlbmRTZWMgKyBUQUlMX1BBRDsNCiAgICAgICAgICAgIGlmIChuZXh0U3RhcnQgIT0gbnVsbCkgZmJPdXQgPSBNYXRoLm1pbihmYk91dCwgbmV4dFN0YXJ0KTsNCiAgICAgICAgfQ0KDQogICAgICAgIHZhciB0b3AgPSBwYXJzZUZpZWxkKGNhcmQuc21hbGxfdG9wLCAgICBmYkluLCBmYk91dCk7DQogICAgICAgIHZhciBobHIgPSBwYXJzZUZpZWxkKGNhcmQuaGlnaGxpZ2h0LCAgICBmYkluLCBmYk91dCk7DQogICAgICAgIHZhciBib3QgPSBwYXJzZUZpZWxkKGNhcmQuc21hbGxfYm90dG9tLCBmYkluLCBmYk91dCk7DQogICAgICAgIHZhciBsZWFkcyA9ICF0b3A7DQoNCiAgICAgICAgdmFyIHJvd3MgPSBbXTsNCiAgICAgICAgZnVuY3Rpb24gcHVzaFJvdyhkZWYsIHNpemUsIGNvbG9yLCBmb250U3BlYywgcmVmTGF5ZXIsIHN1ZmZpeCwgaXNITCwgbGVhZEZsYWcpIHsNCiAgICAgICAgICAgIGlmICghZGVmKSByZXR1cm47DQogICAgICAgICAgICB2YXIgcyA9IGlzSEwgPyByZWNhc2VITChkZWYudGV4dCwgbGVhZEZsYWcpIDogcmVjYXNlU00oZGVmLnRleHQpOw0KICAgICAgICAgICAgdmFyIG0gPSBtYWtlUm93KHMsIHNpemUsIGNvbG9yLCBmb250U3BlYywgcmVmTGF5ZXIsICJDIiArIGNhcmQuaWQgKyBzdWZmaXgsIGRlZi5pblNlYyk7DQogICAgICAgICAgICBtLmluU2VjID0gZGVmLmluU2VjOyBtLm91dFNlYyA9IGRlZi5vdXRTZWM7DQogICAgICAgICAgICByb3dzLnB1c2gobSk7DQogICAgICAgIH0NCiAgICAgICAgcHVzaFJvdyh0b3AsIFNJWkVfU00sIENPTE9SX1NNLCBGT05UX1NNLCByZWZTTSwgIl9UT1AiLCBmYWxzZSwgZmFsc2UpOw0KICAgICAgICBwdXNoUm93KGhsciwgU0laRV9ITCwgQ09MT1JfSEwsIEZPTlRfSEwsIHJlZkhMLCAiX0hMIiwgIHRydWUsICBsZWFkcyk7DQogICAgICAgIHB1c2hSb3coYm90LCBTSVpFX1NNLCBDT0xPUl9TTSwgRk9OVF9TTSwgcmVmU00sICJfQk9UIiwgZmFsc2UsIGZhbHNlKTsNCiAgICAgICAgaWYgKCFyb3dzLmxlbmd0aCkgY29udGludWU7DQoNCiAgICAgICAgdmFyIHRvdGFsSCA9IDA7DQogICAgICAgIGZvciAodmFyIGsgPSAwOyBrIDwgcm93cy5sZW5ndGg7IGsrKykgdG90YWxIICs9IHJvd3Nba10uaDsNCiAgICAgICAgdG90YWxIICs9IFJPV19HQVAgKiAocm93cy5sZW5ndGggLSAxKTsNCg0KICAgICAgICB2YXIgeUN1cnNvciA9IGN5IC0gdG90YWxIIC8gMjsNCiAgICAgICAgZm9yICh2YXIgazIgPSAwOyBrMiA8IHJvd3MubGVuZ3RoOyBrMisrKSB7DQogICAgICAgICAgICB2YXIgaCA9IHJvd3NbazJdLmg7DQogICAgICAgICAgICByb3dzW2syXS5sYXllci5wcm9wZXJ0eSgiQURCRSBUcmFuc2Zvcm0gR3JvdXAiKS5wcm9wZXJ0eSgiQURCRSBQb3NpdGlvbiIpDQogICAgICAgICAgICAgICAgICAgIC5zZXRWYWx1ZShbY3gsIHlDdXJzb3IgKyBoIC8gMl0pOw0KICAgICAgICAgICAgdmFyIGluUyA9IHJvd3NbazJdLmluU2VjLCBvdXRTID0gcm93c1trMl0ub3V0U2VjOw0KICAgICAgICAgICAgaWYgKG91dFMgPD0gaW5TKSBvdXRTID0gaW5TICsgMC4xOw0KICAgICAgICAgICAgaWYgKG91dFMgPiBjb21wLmR1cmF0aW9uKSBvdXRTID0gY29tcC5kdXJhdGlvbjsNCiAgICAgICAgICAgIHJvd3NbazJdLmxheWVyLmluUG9pbnQgID0gaW5TOw0KICAgICAgICAgICAgcm93c1trMl0ubGF5ZXIub3V0UG9pbnQgPSBvdXRTOw0KICAgICAgICAgICAgeUN1cnNvciArPSBoICsgUk9XX0dBUDsNCiAgICAgICAgICAgIGlmICghcm93c1trMl0uYXBwbGllZCkgZmFpbGVkRm9udHMrKzsNCiAgICAgICAgfQ0KDQogICAgICAgIGlmIChMT0dfRk9OVFMpIHsNCiAgICAgICAgICAgIGZvciAodmFyIGszID0gMDsgazMgPCByb3dzLmxlbmd0aDsgazMrKykNCiAgICAgICAgICAgICAgICBsb2dMaW5lcy5wdXNoKHJvd3NbazNdLmxheWVyLm5hbWUgKyAiICAtPiAgIiArIHJvd3NbazNdLmdvdCArICIgIChvazogIiArIHJvd3NbazNdLmFwcGxpZWQgKyAiKSIpOw0KICAgICAgICAgICAgZm9yICh2YXIgZCA9IDA7IGQgPCB1c2VkUmVmcy5sZW5ndGg7IGQrKykgdXNlZFJlZnNbZF0uZW5hYmxlZCA9IGZhbHNlOw0KICAgICAgICAgICAgYXBwLmVuZFVuZG9Hcm91cCgpOw0KICAgICAgICAgICAgYWxlcnQoIkxPR19GT05UUyAtLSBjYXJkICIgKyBjYXJkLmlkICsgIjpcblxuIiArIGxvZ0xpbmVzLmpvaW4oIlxuIikgKyAiXG5cbihTdG9wcGVkLiBTZXQgTE9HX0ZPTlRTPWZhbHNlIHRvIGJ1aWxkIGFsbC4pIik7DQogICAgICAgICAgICByZXR1cm47DQogICAgICAgIH0NCiAgICB9DQoNCiAgICAvLyBoaWRlIHRoZSByZWZlcmVuY2UgbGF5ZXJzIHNvIHRoZXkgZG9uJ3QgcmVuZGVyDQogICAgZm9yICh2YXIgZDIgPSAwOyBkMiA8IHVzZWRSZWZzLmxlbmd0aDsgZDIrKykgdXNlZFJlZnNbZDJdLmVuYWJsZWQgPSBmYWxzZTsNCg0KICAgIGFwcC5lbmRVbmRvR3JvdXAoKTsNCiAgICB2YXIgbXNnID0gIkJ1aWx0ICIgKyBjYXJkcy5sZW5ndGggKyAiIGNhcHRpb24gY2FyZHMgKHBlci1yb3cgdGltZWQpLiI7DQogICAgaWYgKCFyZWZITCB8fCAhcmVmU00pIHsNCiAgICAgICAgbXNnICs9ICJcblxuTk9URTogIiArICghcmVmSEwgPyAiUkVGX0hMICIgOiAiIikgKyAoIXJlZlNNID8gIlJFRl9TTSAiIDogIiIpICsNCiAgICAgICAgICAgICAgICJub3QgZm91bmQgLS0gdGhvc2Ugcm93cyB1c2VkIG5hbWUtYmFzZWQgZm9udHMgKG1heSBzdWJzdGl0dXRlKS4gIiArDQogICAgICAgICAgICAgICAiTWFrZSB0aGUgbWlzc2luZyByZWZlcmVuY2UgbGF5ZXIocykgYW5kIHJlLXJ1bi4iOw0KICAgIH0NCiAgICBpZiAoZmFpbGVkRm9udHMpIG1zZyArPSAiXG5cbiIgKyBmYWlsZWRGb250cyArICIgbGF5ZXIocykgZGlkbid0IGNvbmZpcm0gdGhlIHJlcXVlc3RlZCBmb250LiI7DQogICAgYWxlcnQobXNnKTsNCn0pKCk7";
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

// --------------------------------------------------------- script cleaner --
// Strip the non-spoken scaffolding clients leave in a script before it's
// aligned: ad/scene headers, SRT/VTT cue numbers + timecodes, and leading
// speaker labels. The transcript only contains *spoken* words, so any of this
// left in would align as bogus inserts. Conservative on purpose — it removes
// whole structural lines/prefixes, never touches the prose itself. Idempotent,
// so running it twice is a no-op. Tune the patterns as messier scripts appear.
const RE_VTT_HEADER   = /^\uFEFF?WEBVTT.*$/i;                 // VTT file header
const RE_TIMECODE     = /^\s*(\d{1,2}:)?\d{1,2}:\d{2}([.,]\d{1,3})?\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{2}([.,]\d{1,3})?.*$/; // SRT/VTT cue range
const RE_CUE_NUMBER   = /^\s*\d{1,6}\s*$/;                    // standalone SRT index
const RE_AD_HEADER    = /^\s*(ad|advert|video|script|hook|vsl|ugc|spot|clip|take)\s*#?\s*\d*\s*[—–\-:].*$/i; // "AD 3 — …", "VIDEO 2:", "Hook -"
const RE_BRACKET_NOTE = /^\s*[\[(<].*[\])>]\s*$/;            // [B-ROLL], (pause), <music>
const RE_SPEAKER      = /^\s*[A-Z][A-Za-z0-9 .'\-]{0,28}:\s+/; // "Narrator: ", "VO: ", "Toby: " prefix on a line

function cleanScript(text) {
  if (!text) return "";
  const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
  const kept = [];
  for (let i = 0; i < lines.length; i++) {
    let ln = lines[i];
    if (RE_VTT_HEADER.test(ln)) continue;
    if (RE_TIMECODE.test(ln)) continue;
    // a bare number that is an SRT cue index (followed by a timecode) — not real text
    if (RE_CUE_NUMBER.test(ln) && i + 1 < lines.length && RE_TIMECODE.test(lines[i + 1])) continue;
    if (RE_AD_HEADER.test(ln)) continue;
    if (RE_BRACKET_NOTE.test(ln)) continue;
    ln = ln.replace(RE_SPEAKER, "");               // drop a leading speaker label, keep the line
    kept.push(ln);
  }
  // collapse runs of blank lines, trim the ends
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
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
    // V3 WYSIWYG: emit exactly what the editor shows — no forced lower/upper.
    // Case now lives in the word text itself (edit a word to set it).
    const topTxt = d.top.map((w) => core(w.text)).join(" ");
    const hlTxt = d.hl.map((w) => core(w.text)).join(" ");
    const botTxt = d.bot.map((w) => core(w.text)).join(" ");
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

// ---------------------------------------------------- local persistence ----
// V3: client-side autosave + named local projects via IndexedDB. NO backend.
// Every call is wrapped so that environments where storage is blocked (e.g. the
// sandboxed artifact preview) simply no-op — the app keeps working, it just
// won't persist there. On the deployed site (a real origin) it persists fully.
// Stores only the project STATE (words/cards/cfg/script), never the media blob.
const IDB_NAME = "captionsplitter", IDB_VER = 1;
const idbAvailable = (() => { try { return typeof indexedDB !== "undefined" && !!indexedDB; } catch (e) { return false; } })();

function idbOpen() {
  return new Promise((res, rej) => {
    try {
      const r = indexedDB.open(IDB_NAME, IDB_VER);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
        if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
}
async function idbKvPut(key, val) {
  try { const db = await idbOpen(); return await new Promise((res, rej) => {
    const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").put(val, key);
    tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error); }); } catch (e) { return false; }
}
async function idbKvGet(key) {
  try { const db = await idbOpen(); return await new Promise((res, rej) => {
    const tx = db.transaction("kv", "readonly"); const rq = tx.objectStore("kv").get(key);
    rq.onsuccess = () => res(rq.result != null ? rq.result : null); rq.onerror = () => rej(rq.error); }); } catch (e) { return null; }
}
async function idbKvDel(key) {
  try { const db = await idbOpen(); return await new Promise((res) => {
    const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").delete(key);
    tx.oncomplete = () => res(true); tx.onerror = () => res(false); }); } catch (e) { return false; }
}
async function idbProjPut(p) {
  try { const db = await idbOpen(); return await new Promise((res, rej) => {
    const tx = db.transaction("projects", "readwrite"); tx.objectStore("projects").put(p);
    tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error); }); } catch (e) { return false; }
}
async function idbProjAll() {
  try { const db = await idbOpen(); return await new Promise((res, rej) => {
    const tx = db.transaction("projects", "readonly"); const rq = tx.objectStore("projects").getAll();
    rq.onsuccess = () => res(rq.result || []); rq.onerror = () => rej(rq.error); }); } catch (e) { return []; }
}
async function idbProjDel(id) {
  try { const db = await idbOpen(); return await new Promise((res) => {
    const tx = db.transaction("projects", "readwrite"); tx.objectStore("projects").delete(id);
    tx.oncomplete = () => res(true); tx.onerror = () => res(false); }); } catch (e) { return false; }
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
  const [kind, setKind] = useState("audio");      // "audio" | "video"
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
    const onErr = () => setErr("The browser couldn't load this file. Use a .wav/.mp3/.m4a for audio, or an H.264 .mp4 / .webm for video (ProRes .mov won't play in a browser).");
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
    setKind(/^video\//.test(file.type) || /\.(mp4|m4v|webm|mov|ogv)$/i.test(file.name) ? "video" : "audio");
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

  return { elRef, url, name, kind, channel, duration, playing, time, decoding, err, load, play, pause, toggle, seek, playRange };
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

// ============================================================== video stage =
// V3: a draggable picture-in-picture stage. ONE <video> element (also plays
// audio-only files, so it replaced the old hidden <audio>) stays mounted at all
// times — when the loaded media is audio, or the stage is hidden, the panel is
// parked off-screen but the element keeps playing. When an mp4 is loaded it
// shows the frame with the live caption overlaid, so subs can be reviewed in
// place against the picture. Timing of the overlay derives from the same word
// table as the AE export, so what you see here is what AE will build.

// the card visible at time t (playhead inside [in,out)); -1 if none
function activeCaptionIdx(derived, t) {
  for (let i = 0; i < derived.length; i++) {
    if (t >= derived[i].inSec && t < derived[i].outSec) return i;
  }
  return -1;
}

function VideoStage({ elRef, url, name, kind, show, time, derived, onHide, pos, setPos, tlOffset }) {
  const dragRef = useRef(null);
  const live = kind === "video" && show && !!url;

  const onPointerDown = (e) => {
    const panel = e.currentTarget.closest(".vstage");
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height };
    const move = (ev) => {
      if (!dragRef.current) return;
      const { dx, dy, w, h } = dragRef.current;
      const left = Math.max(6, Math.min(window.innerWidth - w - 6, ev.clientX - dx));
      const top = Math.max(6, Math.min(window.innerHeight - h - 6, ev.clientY - dy));
      setPos({ left, top });
    };
    const up = () => { dragRef.current = null; window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // parked (audio-only or hidden): keep the element mounted but out of the way
  const parkedStyle = { position: "fixed", left: -99999, top: 0, width: 1, height: 1, overflow: "hidden", opacity: 0, pointerEvents: "none" };
  const placement = pos
    ? { left: pos.left, top: pos.top, right: "auto", bottom: "auto" }
    : { right: 18, bottom: 18 + (tlOffset || 0), left: "auto", top: "auto" };

  const d = live && derived.length ? (activeCaptionIdx(derived, time) >= 0 ? derived[activeCaptionIdx(derived, time)] : null) : null;
  // per-row reveal mirrors AE: each row appears at its own in-point, all clear together
  const showTop = d && d.top.length && time >= d.topIn;
  const showHl = d && time >= d.hlIn;
  const showBot = d && d.bot.length && time >= d.botIn;
  const topTxt = d ? d.top.map((w) => core(w.text)).join(" ") : "";
  const hlTxt = d ? d.hl.map((w) => core(w.text)).join(" ") : "";
  const botTxt = d ? d.bot.map((w) => core(w.text)).join(" ") : "";

  return (
    <div className="vstage" style={live ? { ...placement, position: "fixed" } : parkedStyle}>
      <div className="vstage-bar" onPointerDown={onPointerDown}>
        <span className="vstage-grip"><GripVertical size={12} /></span>
        <span className="vstage-name mono">{name || "video"}</span>
        <button className="icon-btn sm" title="Hide video (audio keeps playing)" onPointerDown={(e) => e.stopPropagation()} onClick={onHide}><X size={13} /></button>
      </div>
      <div className="vstage-screen">
        <video ref={elRef} src={url || undefined} playsInline preload="auto" className="vstage-video" />
        {/* caption overlay — only the live rows, centred like the AE default anchor */}
        <div className="vstage-cap">
          {showTop && <div className="vc-sm">{topTxt}</div>}
          {showHl && <div className="vc-hl">{hlTxt}</div>}
          {showBot && <div className="vc-sm">{botTxt}</div>}
        </div>
      </div>
    </div>
  );
}

// ====================================================== preview component ===
// V3 WYSIWYG: the preview shows the card's text exactly as stored (and exactly
// as the AE builder will render it, now that CaptionBuilder uses HL_CASE/SM_CASE
// = "asis"). Capitalize by editing the word's text — no auto lower/upper.
function CardPreview({ d }) {
  const hlTxt = d.hl.map((w) => core(w.text)).join(" ");
  const topTxt = d.top.map((w) => core(w.text)).join(" ");
  const botTxt = d.bot.map((w) => core(w.text)).join(" ");
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
const EMPTY_SET = new Set(); // stable identity so CardRow memo doesn't churn when off-script flagging is toggled off
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
  const [showOffScript, setShowOffScript] = useState(true); // V3: flag off-script words in the stream
  const [showVideo, setShowVideo] = useState(true);         // V3: show the PiP video stage when a video is loaded
  const [stagePos, setStagePos] = useState(null);           // null = default corner; {left,top} once dragged
  const [restored, setRestored] = useState(false);          // V3: showing the "restored last session" banner
  const [savedAt, setSavedAt] = useState(0);                // V3: timestamp of last autosave (drives the indicator)
  const [projOpen, setProjOpen] = useState(false);          // V3: local projects modal
  const [projects, setProjects] = useState([]);             // V3: saved local projects
  const restoreGuard = useRef(false);                       // autosave is inert until the mount-restore attempt finishes
  const docTouched = useRef(false);                         // a doc is active (loaded or restored) — don't auto-restore over it
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

  // V3 off-script detection: a transcript word the script has no counterpart for
  // (a "del" op) is something the client said but didn't script. Contiguous runs
  // read as off-script passages; lone ones are usually filler. Alignment is
  // already live (recomputes on every script/word change), so this flags
  // automatically the moment a script is present — no button to press.
  const offScriptIds = useMemo(() => {
    const s = new Set();
    if (!alignment) return s;
    for (const op of alignment.ops) if (op.type === "del" && words[op.t]) s.add(words[op.t].id);
    return s;
  }, [alignment, words]);

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
      setError(""); setFileName(name); setHlAnchor({}); docTouched.current = true;
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

  // V3 "Split into two": a deliberate, one-click card split (vs the easy-to-miss
  // between-words scissors). Breaks AFTER the highlighted word so the current
  // highlight stays on the first card and the second card re-picks its own —
  // giving you two separate highlighted words across the same timing span. If the
  // highlight is the last word, fall back to splitting off that last word so the
  // action is never a no-op.
  const splitAtHL = useCallback((cardIdx) => {
    const card = cards[cardIdx];
    if (!card || card.wordIds.length < 2) return;
    const at = Math.min(card.hlTo, card.wordIds.length - 2);
    splitCard(cardIdx, at);
  }, [cards, splitCard]);

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
  const exportTable = () => download((fileName.replace(/\.json$/i, "") || "captions") + "_wordtable.json", { meta: { tool: "CaptionSplitter", version: 3.2, cfg }, words, cards });

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

  // ---- V3 local persistence: restore last session, then autosave on change ----
  const loadDocObject = useCallback((doc, markRestored) => {
    if (!doc || !Array.isArray(doc.words) || !doc.words.length || !Array.isArray(doc.cards)) return false;
    resetDoc(computeEmphasis(doc.words), doc.cards);
    if (doc.cfg) setCfg(doc.cfg);
    setScript(typeof doc.script === "string" ? doc.script : "");
    setIgnored(new Set(Array.isArray(doc.ignored) ? doc.ignored : []));
    setFileName(doc.fileName || "");
    setError(""); setHlAnchor({});
    docTouched.current = true;
    if (markRestored) setRestored(true);
    return true;
  }, [resetDoc]);

  // on first mount: pull the rolling autosave slot and restore it (unless the
  // user already loaded something while we were reading).
  useEffect(() => {
    let alive = true;
    (async () => {
      const doc = await idbKvGet("current");
      if (alive && !docTouched.current) loadDocObject(doc, true);
      restoreGuard.current = true; // autosave may run from here on
    })();
    return () => { alive = false; };
  }, [loadDocObject]);

  // debounced autosave of the project state (never the media blob)
  useEffect(() => {
    if (!restoreGuard.current || !words.length) return;
    const t = setTimeout(async () => {
      const ok = await idbKvPut("current", {
        words, cards, cfg, script, fileName, ignored: [...ignored], updatedAt: Date.now(), v: 3.2,
      });
      if (ok) setSavedAt(Date.now());
    }, 700);
    return () => clearTimeout(t);
  }, [words, cards, cfg, script, fileName, ignored]);

  // start a brand-new document and clear the autosave slot
  const startFresh = useCallback(async () => {
    if (typeof window !== "undefined" && words.length &&
        !window.confirm("Clear the current document and start fresh? Your local autosave will be cleared too (saved projects are kept).")) return;
    setPast([]); setFuture([]); lastTag.current = null;
    setWords([]); setCards([]); setScript(""); setIgnored(new Set());
    setFileName(""); setError(""); setRestored(false);
    await idbKvDel("current");
  }, [words]);

  // ---- local projects (named saves) ----
  const refreshProjects = useCallback(async () => { setProjects(await idbProjAll()); }, []);
  useEffect(() => { if (projOpen) refreshProjects(); }, [projOpen, refreshProjects]);

  const saveProjectAs = useCallback(async (name) => {
    const nm = (name || fileName || "Untitled").trim() || "Untitled";
    const p = {
      id: "p" + Date.now().toString(36),
      name: nm,
      savedAt: Date.now(),
      cardCount: cards.length, wordCount: words.length,
      doc: { words, cards, cfg, script, fileName, ignored: [...ignored], v: 3.2 },
    };
    await idbProjPut(p);
    refreshProjects();
  }, [words, cards, cfg, script, fileName, ignored, refreshProjects]);

  const openProject = useCallback((p) => {
    if (p && loadDocObject(p.doc, false)) { setRestored(false); setProjOpen(false); }
  }, [loadDocObject]);

  const deleteProject = useCallback(async (id) => {
    await idbProjDel(id); refreshProjects();
  }, [refreshProjects]);

  // ====================================================================== UI
  return (
    <div className="cap-root" style={rootStyle}>
      <style>{CSS}</style>

      {/* the media element lives in the DOM at all times (it plays audio-only
          files too), so playback works inside sandboxed iframes and never
          remounts. When an mp4 is loaded it surfaces as the draggable stage. */}
      <VideoStage elRef={audio.elRef} url={audio.url} name={audio.name} kind={audio.kind}
        show={showVideo} time={audio.time} derived={derived}
        onHide={() => setShowVideo(false)} pos={stagePos} setPos={setStagePos}
        tlOffset={showTL ? TL_H + 56 : 0} />

      {/* ---------------- top bar ---------------- */}
      <header style={barStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <img src={LOGO_SRC} alt="" width={28} height={28}
            style={{ borderRadius: 7, display: "block", flex: "0 0 auto" }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 650, letterSpacing: "-0.01em" }}>
              Caption Splitter <span className="mono" style={{ fontSize: 9.5, color: C.mut2, fontWeight: 600, verticalAlign: "middle" }}>V3.2</span>
            </div>
            <div className="mono" style={{ fontSize: 10.5, color: C.mut2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {loaded ? fileName : "no transcript loaded"}
              {loaded && idbAvailable && savedAt > 0 && (
                <span style={{ color: C.ok, marginLeft: 8 }}>· autosaved</span>
              )}
              {loaded && !idbAvailable && (
                <span style={{ color: C.mut2, marginLeft: 8 }}>· autosave off (deployed site only)</span>
              )}
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
              {audio.kind === "video" && audio.url ? <Video size={13} /> : <Music size={13} />} {audio.url ? "Replace media" : "Load audio / video"}
            </button>
            <input ref={audioInput} type="file" accept="audio/*,video/mp4,video/webm,.wav,.mp3,.m4a,.aac,.ogg,.flac,.mp4,.m4v,.webm,.mov" style={{ display: "none" }}
              onChange={(e) => { audio.load(e.target.files[0]); e.target.value = ""; setShowTL(true); setShowVideo(true); }} />
            {audio.kind === "video" && audio.url && (
              <button className="btn" onClick={() => setShowVideo((v) => !v)} data-on={showVideo ? "1" : ""} title="Show the video stage with subtitles overlaid">
                <Video size={13} /> Video
              </button>
            )}
            <button className="btn" onClick={() => setShowTL((v) => !v)} data-on={showTL ? "1" : ""}>
              <Clock size={13} /> Timeline
            </button>
            <button className="btn" onClick={() => setShowQC((v) => !v)} data-on={showQC ? "1" : ""}>
              <ListChecks size={13} /> Check script {activeSubs.length ? <span className="badge">{activeSubs.length}</span> : null}
            </button>
            {alignment && dels > 0 && (
              <button className="btn" onClick={() => setShowOffScript((v) => !v)} data-on={showOffScript ? "1" : ""}
                title="Flag words that were spoken but aren't in the loaded script (client went off-script)">
                <ScanLine size={13} /> Off-script <span className="badge">{offScriptIds.size}</span>
              </button>
            )}
            <button className="btn" onClick={() => setShowCfg((v) => !v)} data-on={showCfg ? "1" : ""}>
              <Sliders size={13} /> Rules
            </button>
            <button className="btn" onClick={() => setModal("shortcuts")} title="Keyboard & mouse shortcuts">
              <Keyboard size={13} /> Shortcuts
            </button>
            <button className="btn btn-ghost" onClick={() => setModal("aescript")} title="Get the After Effects builder script">
              <FileCode2 size={13} /> AE script
            </button>
            {idbAvailable && (
              <button className="btn btn-ghost" onClick={() => setProjOpen(true)} title="Save & open local projects (stored in this browser)">
                <FolderOpen size={13} /> Projects
              </button>
            )}
            <button className="btn btn-ghost" onClick={exportTable}><Layers size={13} /> Word table</button>
            <button className="btn btn-accent" onClick={exportCaptions}><Download size={13} /> Export captions</button>
          </>}
        </div>
      </header>

      {/* ---------------- restored-session banner ---------------- */}
      {restored && loaded && (
        <div style={restoreBar}>
          <History size={13} color={C.ok} />
          <span style={{ fontSize: 12, color: C.text }}>
            Restored your last local session{fileName ? <> · <span className="mono" style={{ color: C.mut }}>{fileName}</span></> : null}.
          </span>
          <span style={{ flex: 1 }} />
          <button className="btn btn-sm btn-ghost" onClick={startFresh}>Start fresh</button>
          <button className="icon-btn sm" onClick={() => setRestored(false)} title="Dismiss"><X size={13} /></button>
        </div>
      )}

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
          {alignment && showOffScript && offScriptIds.size > 0 && <Stat icon={<ScanLine size={12} />} label="off-script words" value={offScriptIds.size} tone="warn" />}
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
                  Double-click to fix a typo or set its capitalization. <SplitSquareHorizontal size={10} style={{ verticalAlign: "-1px" }} /> on the rail splits a card into two; between words, <Scissors size={10} style={{ verticalAlign: "-1px" }} /> splits at that point,
                  {" "}<Link2 size={10} style={{ verticalAlign: "-1px" }} /> merges the two words into one timing atom.
                  {alignment && dels > 0 && <> Words <span className="tok-offscript" style={{ color: C.mut }}>underlined in amber</span> were spoken but aren't in the loaded script.</>}
                  {audio.url && <> Tap <Play size={10} style={{ verticalAlign: "-1px" }} /> on a card to hear it; the live word is lit.</>}
                </span>
              </div>
              {cards.map((card, ci) => (
                <CardRow key={card.id + "-" + card.wordIds[0]} card={card} ci={ci} d={derived[ci]}
                  wordById={wordById} editing={editing} editVal={editVal} flash={flash}
                  activeWord={ci === activeCardIdx ? activeWord : null}
                  located={ci === locatedCardIdx ? located : null} hasAudio={!!audio.url}
                  setEditVal={setEditVal} startEdit={startEdit} commitEdit={commitEdit} cancelEdit={cancelEdit}
                  setHL={setHL} splitCard={splitCard} splitAtHL={splitAtHL} mergeUp={mergeUp} mergeDown={mergeDown}
                  mergeWords={mergeWordsByIds} playCard={playCard} playWord={playWord}
                  offScript={showOffScript ? offScriptIds : EMPTY_SET}
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
              <span style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-sm btn-ghost" onClick={() => setScript((s) => cleanScript(s))}
                  disabled={!script.trim()} title="Strip headers, timecodes, cue numbers and speaker labels from the pasted script">
                  <Eraser size={12} /> Tidy
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => scriptInput.current && scriptInput.current.click()}>
                  <Upload size={12} /> Load .txt
                </button>
              </span>
              <input ref={scriptInput} type="file" accept=".txt,text/plain,.md,.srt,.vtt" style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files[0]; e.target.value = "";
                  if (!file) return;
                  const r = new FileReader();
                  r.onload = () => setScript(cleanScript(String(r.result || "")));
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
      {projOpen && (
        <ProjectsModal projects={projects} loaded={loaded} fileName={fileName}
          onSave={saveProjectAs} onOpen={openProject} onDelete={deleteProject} onClose={() => setProjOpen(false)} />
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
        card rail's <SplitSquareHorizontal size={11} style={{ verticalAlign: "-2px" }} /> splits a card into two, and its <ArrowUpToLine size={11} style={{ verticalAlign: "-2px" }} />/<ArrowDownToLine size={11} style={{ verticalAlign: "-2px" }} /> merge
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
function ProjectsModal({ projects, loaded, fileName, onSave, onOpen, onDelete, onClose }) {
  const [name, setName] = useState("");
  const when = (t) => { try { return new Date(t).toLocaleString(); } catch (e) { return ""; } };
  const sorted = [...projects].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  return (
    <Modal title="Local projects" icon={<FolderOpen size={16} color={C.accent} />} onClose={onClose} wide>
      <p style={{ fontSize: 12.5, color: C.mut, lineHeight: 1.55, margin: "0 0 12px" }}>
        Saved in this browser only (no account, no upload). Your work also autosaves continuously to a rolling slot — these named saves are checkpoints you can return to. The clip's audio/video isn't stored, so reload it after opening a project.
      </p>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <input className="ta" style={{ flex: 1, minHeight: 0, height: 34, padding: "7px 10px" }}
          placeholder={"Name this save… (" + (fileName || "Untitled") + ")"} value={name}
          onChange={(e) => setName(e.target.value)} spellCheck={false}
          onKeyDown={(e) => { if (e.key === "Enter" && loaded) { onSave(name); setName(""); } }} />
        <button className="btn btn-accent btn-sm" disabled={!loaded} onClick={() => { onSave(name); setName(""); }}>
          <Save size={13} /> Save checkpoint
        </button>
      </div>
      {sorted.length === 0 ? (
        <div style={{ fontSize: 12.5, color: C.mut2, padding: "14px 0", textAlign: "center" }}>No saved projects yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {sorted.map((p) => (
            <div key={p.id} className="proj-row">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                <div className="mono" style={{ fontSize: 10.5, color: C.mut2 }}>
                  {p.cardCount || 0} cards · {p.wordCount || 0} words · {when(p.savedAt)}
                </div>
              </div>
              <span style={{ display: "flex", gap: 4, flex: "0 0 auto" }}>
                <button className="btn btn-sm" onClick={() => onOpen(p)}><HardDriveDownload size={12} /> Open</button>
                <button className="icon-btn sm" title="Delete this save"
                  onClick={() => { if (typeof window === "undefined" || window.confirm('Delete "' + p.name + '"?')) onDelete(p.id); }}>
                  <Trash2 size={13} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

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
  setEditVal, startEdit, commitEdit, cancelEdit, setHL, splitCard, splitAtHL, mergeUp, mergeDown,
  mergeWords, playCard, playWord, offScript, isLast,
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
          {card.wordIds.length > 1 && (
            <button className="icon-btn sm" title="Split into two cards (breaks after the highlight; each card gets its own highlight)"
              onClick={() => splitAtHL(ci)}>
              <SplitSquareHorizontal size={12} />
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
                    className={"tok tok-" + role + (flash[w.id] ? " tok-flash" : "") + (isActive ? " tok-active" : "") + (isLocated ? " tok-located" : "") + (offScript.has(w.id) ? " tok-offscript" : "")}
                    title={core(w.text) + "  ·  " + w.start.toFixed(2) + "–" + w.end.toFixed(2) + "s  ·  " + w.id + (offScript.has(w.id) ? "  ·  not in script" : "")}
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
const restoreBar = {
  display: "flex", alignItems: "center", gap: 9,
  padding: "7px 18px", borderBottom: "1px solid " + C.borderSoft, background: C.okDim, flex: "0 0 auto",
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
.tok-offscript{text-decoration:underline dashed var(--warn);text-decoration-thickness:2px;text-underline-offset:3px}
.tok-offscript:hover{text-decoration-color:#f0c14b}
.vstage{z-index:50;width:min(46vw,460px);background:#000;border:1px solid var(--border);border-radius:10px;
  box-shadow:0 18px 50px rgba(0,0,0,.6);overflow:hidden;display:flex;flex-direction:column}
.vstage-bar{display:flex;align-items:center;gap:7px;padding:5px 7px;background:var(--panel);border-bottom:1px solid var(--border);cursor:grab;user-select:none}
.vstage-bar:active{cursor:grabbing}
.vstage-grip{color:var(--mut2);display:grid;place-items:center}
.vstage-name{flex:1;min-width:0;font-size:10.5px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vstage-screen{position:relative;width:100%;aspect-ratio:16/9;background:#000;display:grid;place-items:center}
.vstage-video{width:100%;height:100%;object-fit:contain;display:block;background:#000}
.vstage-cap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:2px;padding:0 6%;pointer-events:none;text-align:center;text-shadow:0 2px 8px rgba(0,0,0,.85)}
.vc-sm{font-size:clamp(11px,2.4vw,17px);line-height:1.15;color:#fff;font-weight:500}
.vc-hl{font-size:clamp(17px,4vw,30px);line-height:1.1;color:#fff;font-weight:750;letter-spacing:-0.01em}
.proj-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 11px;
  border:1px solid var(--border);border-radius:8px;background:var(--panel2)}
.proj-row:hover{border-color:#34343b}
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
