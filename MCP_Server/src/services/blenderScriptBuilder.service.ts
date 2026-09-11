export interface BlenderPromptOutput {
  modelName: string;
  lodLevel: string;
  completenessScore: number;
  masterPrompt: string;
  markdownTable: string;
  artDirectorBrief: string;
  claudeMcpPrompt: string;
  blenderBpyScript: string;
  images?: string[];
}

export class BlenderScriptBuilderService {
  /**
   * Constructs the phase-gated Blender MCP Master Prompt matching the standard specification structure.
   */
  public buildMasterPrompt(specs: any, imageUrls: string[] = []): string {
    const mech = specs.mechanical || {};
    const term = specs.terminals || {};
    const disp = specs.displayAndControls || {};
    const mat = specs.materialsAndShaders || {};

    const modelName = specs.modelName || 'Schneider Electric EasyLogic™ EM6436H LED';
    const prefix = specs.prefix || (modelName.includes('EM6436') ? 'EM6436' : (modelName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 8).toUpperCase()));

    const widthMm = mech.width_mm || 96.0;
    const heightMm = mech.height_mm || 96.0;
    const totalDepthMm = mech.depth_mm || 101.5;
    const bezelDepthMm = mech.bezelThickness_mm || mech.bezelDepth_mm || 13.9;
    const secondaryBodyMm = mech.secondaryBody_mm || 90.5;
    const bodyDepthMm = (totalDepthMm - bezelDepthMm).toFixed(1);
    const clipPlaneDepthMm = mech.depthBehindPanel_mm || 48.8;
    const cutoutWMm = mech.panelCutoutWidth_mm || 92.0;
    const cutoutHMm = mech.panelCutoutHeight_mm || 92.0;
    const maxPanelThickMm = mech.maxPanelThickness_mm || 5.0;

    return `# ${modelName} — Blender MCP Modeling Master Prompt
Purpose: Phase-gated 3D modeling of the ${modelName.includes('EM6436') ? 'EM6436H' : modelName} panel-mount energy meter, built as one continuously-maintained Blender Python script, with accurate real-world dimensions and zero overlapping geometry.

### 0. Source Notes & Assumptions (verify before trusting blindly)

| Item | Value used | Source / confidence |
| :--- | :--- | :--- |
| **Front bezel footprint** | ${widthMm} × ${heightMm} mm | Installation sheet §3, HIGH confidence |
| **Total device depth (front face → rear-most terminal)** | ${totalDepthMm} mm | Installation sheet §3, HIGH confidence |
| **Secondary body cross-section (behind flange)** | ${secondaryBodyMm} × ${secondaryBodyMm} mm | Installation sheet §3, MEDIUM — confirm against side profile images 3 & 4 |
| **Flange step depth** | ${bezelDepthMm} mm | Installation sheet §3, MEDIUM — confirm visually |
| **Depth behind panel (to retainer clip plane)** | ${clipPlaneDepthMm} mm (manual text rounds to "49 mm") | Both docs agree, HIGH |
| **Panel cutout (not modeled, reference only)** | ${cutoutWMm} (+0.8/-0) × ${cutoutHMm} mm | Installation sheet §4 |
| **Max panel thickness** | ${maxPanelThickMm} mm | Installation sheet §3 |
| **Mounting orientation** | Vertical only | User manual |
| **Display** | 3 rows × 4-digit 8-segment alphanumeric LED, red, "K"/"M" indicators, per-row pictogram column (⌐ / G / L symbols) | User manual + front images |
| **Analog load bar** | 12 LEDs, vertical, right of display, scale labels 10–120 + "%A FS" text | Images 1, 5, 6, 9 |
| **Buttons** | 4 circular: Left, Down (with padlock icon), Up, OK/Enter (green, larger) | Images 1, 9 |
| **Status LEDs** | 2, right of buttons: red "pulse" icon (energy pulsing) + green "heartbeat/ECG" icon (serial comm) | Images 1, 9 |
| **Rear terminals** | V1/V2/V3/VN (voltage, clear flip cover) · L1/L2 (control power, clear flip cover) · I1+/I1-/I2+/I2-/I3+/I3- (current) · D1+/D0- (RS-485) | Images 2, 7, 8, 10 + wiring diagrams §6 |
| **Side features** | Retainer clip (black, spring-tab mechanism) on one side; triangular ventilation louvers top & bottom of body | Images 3, 4, 5, 6 |
| **Rear labels** | DANGER/PELIGRO warning sticker, Schneider Electric logo, QR code, serial/model plate | Image 2 |

#### Color & Material Approximations
No official color codes were provided in the spec sheets. Use these as a starting approximation and adjust once you can sample the actual reference images in-session:
- **Housing (graphite gray plastic):** \`#5A5D61\` matte
- **Bezel front face (slightly lighter):** \`#6B6E72\` matte
- **Display window (unlit LED glass):** \`#3A0E0E\`, LED-on emission \`#FF2A1A\`
- **Green button ring / OK button:** \`#2E9E4F\`
- **Button caps / recessed centers:** \`#3C3E40\`
- **Terminal covers:** clear polycarbonate, transmission ~0.9, IOR 1.45
- **Screw terminals:** brushed steel/silver metallic
- **Warning label:** white base, red header band, black pictogram

> **Unresolved ambiguity to flag to Claude at session start:** the exact internal stepped profile (where ${bezelDepthMm}mm flange meets the ${secondaryBodyMm}mm body, and where the ${clipPlaneDepthMm}mm clip-plane falls within that) is reconstructed from two separate dimension callouts, not one continuous section drawing. Phase 2 includes an explicit instruction to cross-check this against the silhouette in the side-profile images before finalizing.

---

### 1. Global Session Rules (paste this once at the very start, keep it active for the whole conversation)

\`\`\`text
You are modeling a ${modelName} panel-mount energy 
meter in Blender via the Blender MCP tools. Follow these rules for the ENTIRE 
session, across every phase:
1. SINGLE SCRIPT / SINGLE SCENE: Do not restart the scene between phases. Every 
   phase adds to the same Blender session. Before writing new code, query current 
   scene state (existing objects/collections) so you never duplicate or 
   double-create geometry.
2. UNITS: Set Scene Units to Metric, Unit Scale = 0.001, so that 1 Blender unit 
   = 1 mm. All dimensions I give you are in millimeters — enter them directly.
3. ORIGIN & ORIENTATION: World origin (0,0,0) = center of the front bezel face, 
   at the front-most visible surface. +Y = into the device (toward the rear 
   terminals), +Z = up, +X = right (as viewed from the front, facing the display).
4. NAMING & COLLECTIONS: Use the prefix "${prefix}_" for every object. Organize 
   into collections: ${prefix}_Bezel, ${prefix}_Body, ${prefix}_Display, ${prefix}_Controls, 
   ${prefix}_Rear_Terminals, ${prefix}_Labels, ${prefix}_Materials. Name objects 
   descriptively, e.g. ${prefix}_Display_L1_Segment, ${prefix}_Button_OK, 
   ${prefix}_Terminal_V1.
5. REFERENCE IMAGES: At the start of each phase, re-examine the relevant 
   reference image(s) I specify before writing geometry. Where I give you an 
   exact mm dimension, use it exactly. Where no dimension is given (display 
   window size, button spacing, vent slot size, label positions, etc.), measure 
   the feature's proportion relative to the known ${widthMm}×${heightMm}mm bezel in the reference 
   photo and scale accordingly — do not invent arbitrary round numbers.
6. NO OVERLAPPING GEOMETRY: After each phase, run a bounding-box overlap check 
   between all newly added objects and all previously existing objects (compare 
   world-space bounding boxes; flag/report any unintended intersection before 
   proceeding — intentional touches like a part sitting flush against another 
   are fine, but interpenetrating volumes are not). Report the check result to 
   me before moving to the next phase.
7. MODIFIERS: Keep modifiers (Bevel, Boolean, Mirror, Solidify) live/unapplied 
   until the final assembly phase (Phase 8), so earlier phases stay editable. 
   Only apply transforms/modifiers in the final cleanup step.
8. PHASE GATES: After completing each phase, stop, summarize what was built 
   (object names, dimensions used, any proportion estimates made), and wait for 
   my confirmation before starting the next phase. Do not silently continue.
9. SCALE SANITY CHECK: At the end of each phase, report the current overall 
   bounding box of the whole ${prefix} assembly so we can confirm it's tracking 
   toward the final ${widthMm} × ${heightMm} × ${totalDepthMm} mm envelope.
Acknowledge these rules, then wait for Phase 1.
\`\`\`

---

### 2. Phase Prompts
Paste these one at a time, in order, only after confirming the previous phase's result. Each references the specific images to look at (numbered as you uploaded them: Image 1 = front, Image 2 = back, Image 3/4 = side profiles, Image 5/6 = front perspectives, Image 7/8 = back perspectives, Image 9 = annotated front closeup, Image 10 = annotated rear schematic).

#### Phase 1 — Scene Setup & Blocking
\`\`\`text
PHASE 1: SETUP & BLOCKING PROXY
1. Apply the Global Session Rules above.
2. Create the collection structure specified in Rule 4.
3. Build a simple, low-poly blocking proxy of the whole device using two boxes, 
   just to validate proportions before any detail work:
   a. ${prefix}_Bezel_Proxy: box ${widthMm}mm (X) × ${heightMm}mm (Z) × ${bezelDepthMm}mm (Y depth)
   b. ${prefix}_Body_Proxy: box ${secondaryBodyMm}mm (X) × ${secondaryBodyMm}mm (Z) × ${bodyDepthMm}mm (Y depth), 
      positioned so it starts where the bezel proxy ends and the combined 
      assembly totals ${totalDepthMm}mm depth.
4. Look at Image 3 and Image 4 (side profiles). Compare the silhouette step 
   between flange and body against this two-box proxy. Report whether the 
   proportions look correct, and note any adjustment needed to the ${bezelDepthMm}mm / 
   ${secondaryBodyMm}mm / ${bodyDepthMm}mm split before we commit to it in Phase 5 (case body detail).
5. Add a simple 3-point studio light rig and a camera framed on the front face, 
   just for visual QA screenshots as we go (not final render quality).
6. Report the bounding box of the proxy assembly and confirm it reads as 
   ${widthMm} × ${heightMm} × ${totalDepthMm} mm.
\`\`\`

#### Phase 2 — Front Bezel Detail
\`\`\`text
PHASE 2: FRONT BEZEL
Replace the bezel proxy with the detailed bezel geometry.
1. Reference: Image 1 (front, flat), Image 5/6 (front perspective), Image 9 
   (annotated closeup).
2. Build ${prefix}_Bezel as a ${widthMm} × ${heightMm}mm square panel, ${bezelDepthMm}mm deep, with:
   - Slightly rounded outer corners (small radius, match Image 1 — outer 
     corners are not sharp 90°, estimate radius proportionally from the image)
   - A very slight raised outer lip/rim around the perimeter (visible as a 
     subtle frame in Image 1)
   - The main recessed face area where the display, load bar, and buttons will 
     sit in later phases (do not detail these yet — just block out the recessed 
     panel region flush with the images)
3. Do NOT yet add text/logos — that happens in Phase 6/7 as decals.
4. Run the overlap check against the body proxy from Phase 1.
5. Report bounding box and confirm still ${widthMm} × ${heightMm} × ${bezelDepthMm}mm for this part alone.
\`\`\`

#### Phase 3 — Display Module (3 LED Rows + Analog Load Bar)
\`\`\`text
PHASE 3: DISPLAY MODULE
Reference: Image 1 (front flat — best for proportion measuring), Image 9 
(annotated closeup showing labels A/B), Image 5/6 (perspective, useful for 
depth of the recessed display window).
1. Using Image 1, measure the display block's proportion relative to the known 
   ${widthMm}mm bezel width to determine: total display window width/height, position 
   (it's left-of-center, occupying roughly the left ~55-60% of the face height 
   ~65-70%), and depth recess (a few mm behind the bezel front face — glass/
   window look).
2. Build THREE horizontal display rows (L1, L2, L3), each containing:
   a. A narrow left-side pictogram column showing small ⌐ / "G" / "L" stacked 
      icons per row (these can be simple flat extruded/engraved shapes or 
      texture decals — your choice, but keep them as separate small objects 
      named ${prefix}_Display_L1_Icons etc. so material can be applied later)
   b. A dark maroon rectangular "glass" panel representing the 4-digit 
      8-segment LED area (${prefix}_Display_L1_Segments, _L2_, _L3_) — model as 
      a single flat emissive-capable panel per row for now; do not model 
      individual 7/8-segment strokes, that's unnecessary detail for this scale
   c. Thin dividing bezel lines between the three rows (visible as black gaps 
      in Image 1)
3. Build the ANALOG LOAD BAR to the right of the display:
   - A vertical column of 12 small circular LED indicators (flat cylinders), 
     evenly spaced, spanning the same vertical extent as the 3 display rows 
     combined
   - Scale label geometry/decal placeholders for "120, 110, 100, 90, 80, 70, 
     60, 50, 40, 30, 20, 10" running top to bottom beside the LEDs (can be a 
     single text-decal plane for now, refine texture in Phase 7)
   - A small vertical "%A FS" text label further right, rotated 90°
4. All display module geometry should be recessed slightly (a couple mm) 
   behind the bezel front face — check against Image 5/6 perspective for the 
   window depth.
5. Overlap check against Bezel and Body proxy.
6. Report bounding box of the whole display module and confirm it sits fully 
   within the ${widthMm}×${heightMm}mm bezel face with no protrusion past the front face plane.
\`\`\`

#### Phase 4 — Control Buttons & Status LEDs
\`\`\`text
PHASE 4: BUTTONS & STATUS LEDS
Reference: Image 1, Image 9 (closeup shows button icons clearly).
1. Below the display module, build 4 circular buttons in a horizontal row:
   - Button 1 (Left/Back): plain left-chevron icon
   - Button 2 (Down): down-chevron + small padlock icon underneath (shared 
     with Button 3 — the lock icon straddles buttons 2 and 3, matching Image 1/9)
   - Button 3 (Up): up-chevron icon
   - Button 4 (OK/Enter): visibly LARGER than the other three, green-accented, 
     with a "return-arrow into >" icon
   All four should be modeled as: a circular recessed ring (green outline) 
   with a slightly domed or flat button cap inset, sitting in a shallow 
   circular pocket in the bezel face. Measure diameter and spacing 
   proportionally from Image 1 relative to the ${widthMm}mm bezel width.
2. To the right of the buttons, add 2 small status LED indicator dots (flat 
   circles), stacked vertically, each paired with a small icon just to their 
   right:
   - Top: red LED + square-pulse-wave icon (energy pulsing indicator)
   - Bottom: green LED + heartbeat/ECG-wave icon (serial comm indicator)
3. Name objects ${prefix}_Button_Left, ${prefix}_Button_Down, ${prefix}_Button_Up, 
   ${prefix}_Button_OK, ${prefix}_LED_Pulse, ${prefix}_LED_Heartbeat.
4. Overlap check.
5. Report bounding box of the control cluster and confirm it stays within the 
   lower portion of the ${widthMm}×${heightMm}mm face, below the display module, with no 
   collision against it.
\`\`\`

#### Phase 5 — Case Body, Ventilation, Retainer Clip
\`\`\`text
PHASE 5: CASE BODY, VENTS & RETAINER CLIP
Reference: Image 3, Image 4 (side profiles — primary), Image 5, Image 6 
(perspectives showing the clip mechanism and vent louvers in 3D), Image 2 
(back, shows top edge of body).
1. Replace the Body Proxy from Phase 1 with the detailed ${prefix}_Body:
   - Cross-section ${secondaryBodyMm} × ${secondaryBodyMm}mm, stepping down from the ${widthMm}×${heightMm}mm bezel 
   - Apply the depth split you validated/adjusted in Phase 1's check 
     (${bezelDepthMm}mm flange + remaining depth to total ${totalDepthMm}mm), confirming the 
     ${clipPlaneDepthMm}mm clip-plane position along that depth against Image 3/4 silhouettes
   - Slightly tapered/stepped profile if visible in the side images (the body 
     is not a perfectly uniform extrusion — check for a secondary step or 
     taper near the rear where terminal blocks begin)
2. Add TRIANGULAR VENTILATION LOUVERS on the top and bottom faces of the body 
   (visible in Image 3, 4, 5, 6 as rows of small triangle-shaped slot cutouts). 
   Model as an array of small triangular prism cutouts (boolean difference) 
   or as separate inset triangle shapes — your choice, but they must read as 
   through-slots, not flat decals, since the images show clear depth/shadow.
3. Add the RETAINER CLIP mechanism on one side face (visible in Image 3, 4, 5, 
   6 as a black plastic clip with a spring-tab, extending out then folding 
   back with an angled bracket, roughly centered along the body's depth near 
   the ${clipPlaneDepthMm}mm clip-plane). Model this as a distinct sub-part (or two: bracket 
   + tab) so it reads as a separate mechanism, not fused into the body shell.
4. Add the "Warranty void if this label is tampered with" label as a small 
   rectangular decal placeholder on the side face opposite or near the clip 
   (Image 3 shows this clearly — vertical text orientation, dark blue/navy 
   background band).
5. Overlap check — pay special attention to the clip mechanism not 
   intersecting the body shell it's mounted to (touching/attached is fine, 
   interpenetrating solid volumes is not).
6. Report full-assembly bounding box; should now read close to the final 
   ${widthMm} × ${heightMm} × ${totalDepthMm}mm envelope (rear terminals not yet added).
\`\`\`

#### Phase 6 — Rear Terminal Blocks & Rear Labels
\`\`\`text
PHASE 6: REAR TERMINALS & LABELS
Reference: Image 2 (back, flat — primary), Image 7, Image 8 (back 
perspectives), Image 10 (annotated rear schematic with callouts A/B/C/D), 
wiring diagram section from the installation sheet for terminal count/layout.
1. At the rear face of ${prefix}_Body, build the terminal block layout exactly 
   as labeled in Image 10:
   - Callout A — Voltage input terminals: 4 screw terminals labeled V1, V2, 
     V3, VN, arranged in a row, under a CLEAR flip-up polycarbonate terminal 
     cover (model the cover as a separate transparent hinged-looking part, 
     matching the "up" position shown in Images 2/7/8)
   - Callout B — Control power terminals: 2 screw terminals labeled L1, L2, 
     positioned to the right of the voltage terminals, sharing the same style 
     of clear flip cover
   - Callout C — RS-485 terminals: 2 small screw terminals labeled D1+, D0-, 
     lower-right area, distinct green/small terminal caps as seen in Image 10
   - Callout D — Current input terminals: 6 screw terminals labeled I1+, I1-, 
     I2+, I2-, I3+, I3-, arranged in a row along the bottom edge of the rear 
     face
   Model each screw terminal as an ACCURATE screw, not a simplified stand-in:
   - Cylindrical shank sized proportionally to the terminal block pitch shown 
     in Image 2/7/8/10
   - A slightly domed or pan-style head (match the rounded profile visible in 
     the reference images), with a raised rim
   - A genuine cross/Phillips-style recessed slot cut INTO the head face via 
     boolean difference (two intersecting slot cuts at 90°, with real depth 
     and slightly angled/tapered walls), not a flat decal or shallow groove
   - Light thread indication on the shank is optional/not required since the 
     shank is mostly hidden inside the terminal block housing — focus detail 
     budget on the visible head geometry
   - Model ONE terminal screw as a proper hero asset first (${prefix}_Terminal_
     Screw_Master), verify it reads correctly at close-up render distance, 
     then instance/duplicate it for all remaining terminal positions (V1, V2, 
     V3, VN, L1, L2, I1+, I1-, I2+, I2-, I3+, I3-, D1+, D0-) rather than 
     rebuilding the geometry each time.
2. Add the rear label plate: a flat rectangular decal placeholder in the 
   position shown in Image 2/7/8, sized proportionally to that reference, for:
   - The white/red "DANGER/PELIGRO" warning graphic (multi-language safety 
     text block + electric shock pictogram)
   - The Schneider Electric logo
   - QR code + serial number / model / firmware text block
   These can all be a single combined decal texture plane for now — actual 
   graphic content gets applied as an image texture in Phase 7.
3. Confirm terminal blocks sit at/near the rear-most face of the body 
   (consistent with the ${totalDepthMm}mm total depth) and do NOT protrude past that 
   plane except for the screw heads themselves, which is expected.
4. Overlap check against the body shell.
5. Report full-assembly bounding box — should now match the final target: 
   ${widthMm} × ${heightMm} × ${totalDepthMm}mm (excluding any screw-head micro-protrusion, which is fine 
   to note separately, e.g. "${totalDepthMm}mm body + ~1-2mm screw head protrusion").
\`\`\`

#### Phase 7 — Materials & Shading
\`\`\`text
PHASE 7: MATERIALS
Apply PBR materials to every object built in Phases 2-6. Use the color/finish 
table below as a starting point — if you're able to sample colors more 
precisely from the reference images at this point, do so and note any 
deviation from these defaults:
- ${prefix}_Mat_HousingGray: matte plastic, base color #5A5D61, roughness ~0.55
- ${prefix}_Mat_BezelGray: matte plastic, base color #6B6E72, roughness ~0.5
- ${prefix}_Mat_DisplayGlassOff: base color #3A0E0E, roughness 0.3, slight 
  transmission for a "glass window" look
- ${prefix}_Mat_LEDRedEmit: emission #FF2A1A, strength ~3-5 (defined for later 
  use, but NOT applied to the display segment panels in this pass — see note 
  below)
- ${prefix}_Mat_ButtonGreen: base color #2E9E4F, roughness 0.4
- ${prefix}_Mat_ButtonDark: base color #3C3E40, roughness 0.5
- ${prefix}_Mat_LEDRed / ${prefix}_Mat_LEDGreen: small emissive dots for the status 
  LEDs (off/dim state is fine for a static product render)
- ${prefix}_Mat_ClearCover: transmission ~0.9, roughness 0.1, IOR 1.45, slight 
  tint if the reference images show one
- ${prefix}_Mat_Metal_Terminal: metallic 1.0, roughness 0.3, base color light 
  silver/steel
- ${prefix}_Mat_ClipBlack: matte black plastic, base color #1C1C1E, roughness 0.6
- ${prefix}_Mat_LabelWhite / ${prefix}_Mat_LabelRedBand: for the warning label — use 
  simple flat colors for now unless we generate/import actual label textures
Assign materials to the correct collections/objects. Report which objects 
still have no material assigned, if any, before moving on.
DISPLAY STATE: Keep the display NEUTRAL — apply ${prefix}_Mat_DisplayGlassOff 
(the dark unlit-glass material) to all three ${prefix}_Display_L*_Segments 
panels. Do not show sample digits and do not apply the emissive red material 
to the segments in this pass. The status LEDs (pulse/heartbeat) and load-bar 
LEDs should also stay in their dim/off material state for the same reason — 
this is a neutral, powered-off product shot.
\`\`\`

#### Phase 8 — Final Assembly, Cleanup & QA
\`\`\`text
PHASE 8: FINAL ASSEMBLY & QA
1. Do a full-scene overlap/intersection pass: for every object in every 
   collection, compare world-space bounding boxes against every other object 
   and flag any unintended interpenetration (not just adjacent-phase pairs — 
   check everything now that it's all together).
2. Apply all transforms (Ctrl+A equivalent — location, rotation, scale) and 
   apply any remaining live modifiers (Bevel, Boolean, Solidify, Mirror) now 
   that geometry is final.
3. Verify final overall bounding box reads ${widthMm}mm (X) × ${heightMm}mm (Z) × ~${totalDepthMm}mm (Y), 
   confirm against the master dimension table in Section 0.
4. Clean up: remove any leftover proxy objects from Phase 1, purge unused 
   materials/orphan data, rename anything inconsistently named to follow the 
   ${prefix}_ prefix convention.
5. Set up a clean 3-4 point studio lighting rig and camera(s) — one front 
   three-quarter view matching the angle of Image 5/6, and one rear 
   three-quarter view matching Image 7/8 — and render a quick preview from 
   each for visual comparison against the original reference photos.
6. Report a final summary: object/collection count, final bounding box, list 
   of any assumptions made along the way that I should double check against 
   the physical product or higher-res references (e.g., vent slot count/
   spacing, exact button diameter, exact clip geometry) since those were 
   derived from image-proportion estimates rather than explicit spec numbers.
\`\`\`

---

### 3. How to Run This
1. Open your Blender MCP session with Claude, attach the same reference images/PDFs from this conversation.
2. Paste **Section 1 (Global Session Rules)** first and let Claude acknowledge it.
3. Paste **Phase 1**, review the result/screenshot, confirm or correct.
4. Repeat for **Phases 2 → 8**, in order, only advancing once you're happy with each phase's proportions against the reference images.
5. If any phase's proportion-estimate turns out visibly wrong against the images, correct it in that phase before moving on — don't try to fix it retroactively in a later phase, since later phases assume earlier geometry is trustworthy.

*Suggested first message to Claude in the Blender session:*
> "I'm going to model the ${modelName} in phases using Blender MCP. Here are the reference images and spec sheets. First, follow these Global Session Rules exactly, then wait for Phase 1."
`;
  }

  public build3DPrompt(specs: any, imageUrls: string[] = []): BlenderPromptOutput {
    const mech = specs.mechanical || {};
    const term = specs.terminals || {};
    const disp = specs.displayAndControls || {};
    const mat = specs.materialsAndShaders || {};

    const modelName = specs.modelName || 'Schneider Electric EasyLogic™ EM6436H LED';
    const lod = specs.lodLevel || 'LoD 3';
    const score = specs.completenessScore || 98;

    const masterPrompt = this.buildMasterPrompt(specs, imageUrls);

    // Legacy compatibility fields
    const markdownTable = `
### 📐 Micro-Detailed Technical Specifications (${lod} - Completeness: ${score}%)

| Category | Parameter | Extracted Value |
| :--- | :--- | :--- |
| **Mechanical** | Outer Dimensions ($W \\times H \\times D$) | **${mech.width_mm || 96} mm** $\\times$ **${mech.height_mm || 96} mm** $\\times$ **${mech.depth_mm || 101.5} mm** |
| **Mechanical** | Panel Cutout ($W \\times H$) | **${mech.panelCutoutWidth_mm || 92} mm** $\\times$ **${mech.panelCutoutHeight_mm || 92} mm** |
| **Mechanical** | Flange Step / Secondary Body | Flange: **${mech.bezelThickness_mm || 13.9} mm**, Body: **${mech.secondaryBody_mm || 90.5} mm** |
| **Terminals** | Terminal Array Layout | **${term.totalCount || 14} Terminals** (V1-VN, L1-L2, I1-I3, RS485) |
| **Display** | Display & Controls | 3 Rows LED + 12-LED Analog Load Bar, 4 Buttons, 2 Status LEDs |
`;

    const artDirectorBrief = masterPrompt;
    const claudeMcpPrompt = masterPrompt;

    const widthM = (mech.width_mm || 96) / 1000.0;
    const heightM = (mech.height_mm || 96) / 1000.0;
    const depthM = (mech.depth_mm || 101.5) / 1000.0;
    const bezelM = (mech.bezelThickness_mm || 13.9) / 1000.0;
    const bodyDepthM = (depthM - bezelM);
    const bodyWM = (mech.secondaryBody_mm || 90.5) / 1000.0;

    const blenderBpyScript = `import bpy
import math

# Clear factory scene objects
bpy.ops.wm.read_factory_settings(use_empty=True)

# Scene unit setup (1 unit = 1 mm)
bpy.context.scene.unit_settings.system = 'METRIC'
bpy.context.scene.unit_settings.scale_length = 0.001

# Collections setup
col_bezel = bpy.data.collections.new("EM6436_Bezel")
col_body = bpy.data.collections.new("EM6436_Body")
bpy.context.scene.collection.children.link(col_bezel)
bpy.context.scene.collection.children.link(col_body)

# Proxy Bezel (96x96x13.9mm)
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, ${bezelM / 2.0}, 0))
bezel_proxy = bpy.context.active_object
bezel_proxy.name = "EM6436_Bezel_Proxy"
bezel_proxy.dimensions = (${widthM}, ${bezelM}, ${heightM})

# Proxy Body (90.5x90.5x87.6mm)
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, ${bezelM + bodyDepthM / 2.0}, 0))
body_proxy = bpy.context.active_object
body_proxy.name = "EM6436_Body_Proxy"
body_proxy.dimensions = (${bodyWM}, ${bodyDepthM}, ${bodyWM})

print("✅ EM6436H Phase 1 Blocking Proxy Initialized Successfully!")
`;

    return {
      modelName,
      lodLevel: lod,
      completenessScore: score,
      masterPrompt,
      markdownTable,
      artDirectorBrief,
      claudeMcpPrompt,
      blenderBpyScript,
      images: imageUrls,
    };
  }
}

export default BlenderScriptBuilderService;
