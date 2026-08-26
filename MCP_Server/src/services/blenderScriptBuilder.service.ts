export interface BlenderPromptOutput {
  modelName: string;
  lodLevel: string;
  completenessScore: number;
  markdownTable: string;
  claudeMcpPrompt: string;
  blenderBpyScript: string;
}

export class BlenderScriptBuilderService {
  /**
   * Constructs an ultra-detailed Blender MCP prompt and Python (bpy) production script from micro-specifications.
   */
  public build3DPrompt(specs: any): BlenderPromptOutput {
    const mech = specs.mechanical || {};
    const term = specs.terminals || {};
    const disp = specs.displayAndControls || {};
    const mat = specs.materialsAndShaders || {};

    const modelName = specs.modelName || 'Industrial Device';
    const lod = specs.lodLevel || 'LoD 3';
    const score = specs.completenessScore || 90;

    // 1. Build Markdown Specifications Table
    const markdownTable = `
### 📐 Micro-Detailed Technical Specifications (${lod} - Completeness: ${score}%)

| Category | Parameter | Extracted Value |
| :--- | :--- | :--- |
| **Mechanical** | Outer Dimensions ($W \\times H \\times D$) | **${mech.width_mm || 96} mm** $\\times$ **${mech.height_mm || 96} mm** $\\times$ **${mech.depth_mm || 80} mm** |
| **Mechanical** | Panel Cutout ($W \\times H$) | **${mech.panelCutoutWidth_mm || 92} mm** $\\times$ **${mech.panelCutoutHeight_mm || 92} mm** |
| **Mechanical** | Bezel Thickness / Chamfer | Bezel: **${mech.bezelThickness_mm || 4} mm**, Chamfer Bevel: **${mech.outerChamferRadius_mm || 2} mm** |
| **Mechanical** | DIN Rail Interface | Standard **${mech.dinRailChannelWidth_mm || 35} mm** Channel (Depth: ${mech.dinRailChannelDepth_mm || 7.5} mm) |
| **Terminals** | Terminal Array Layout | **${term.totalCount || 14} Terminals** (${term.rowCount || 2} rows of ${term.pinsPerRow || 7}, Pitch: **${term.pitchSpacing_mm || 5.08} mm**) |
| **Terminals** | Pin Silkscreen Markings | \`${(term.silkscreenLabels || ['A1','A2','A3','V1','V2','V3','VN','RS485+','RS485-']).join('`, `')}\` |
| **Display** | Screen Dimensions | **${disp.screenWidth_mm || 65} mm** $\\times$ **${disp.screenHeight_mm || 35} mm** (Inset: ${disp.screenInsetDepth_mm || 1.5} mm) |
| **Display** | Technology & Controls | **${disp.displayType || '7-Segment LED'}**, ${disp.buttonCount || 4} Pushbuttons (${disp.buttonDiameter_mm || 6.5}mm dia), ${disp.ledCount || 3} Status LEDs |
| **Shaders** | Casing & Optics Shaders | Casing: **${mat.bodyMaterial || 'Matte ABS Plastic'}** (\`${mat.bodyColorHex || '#1E1E1E'}\`, Roughness: ${mat.bodyRoughness || 0.35}) |
| **Shaders** | Display Lens & Terminals | Lens: Transmission **${mat.screenTransmission || 0.92}**, IOR **${mat.screenIOR || 1.58}**, Terminals: PBT Green (\`${mat.terminalColorHex || '#2E7D32'}\`) |
`;

    // 2. Build Master Claude / Blender MCP Prompt
    const claudeMcpPrompt = `> "Generate a hyper-realistic, precision 3D CAD digital twin of the ${modelName} in Blender.
> Set outer dimensions to exactly ${mech.width_mm || 96}mm (X) x ${mech.depth_mm || 80}mm (Y) x ${mech.height_mm || 96}mm (Z). Apply a ${mech.outerChamferRadius_mm || 2}mm chamfer bevel to all main body edges. Create a panel cutout step of ${mech.panelCutoutWidth_mm || 92}mm x ${mech.panelCutoutHeight_mm || 92}mm.
> On the front face, create an inset display window (${disp.screenWidth_mm || 65}mm x ${disp.screenHeight_mm || 35}mm) with a transparent polycarbonate acrylic shader (Transmission: ${mat.screenTransmission || 0.92}, IOR: ${mat.screenIOR || 1.58}, Roughness: ${mat.screenRoughness || 0.05}). Position ${disp.buttonCount || 4} circular pushbuttons (${disp.buttonDiameter_mm || 6.5}mm diameter, ${disp.buttonReliefHeight_mm || 1.2}mm relief) below the screen.
> On the rear face, generate ${term.totalCount || 14} terminal blocks (${term.rowCount || 2} rows of ${term.pinsPerRow || 7}, ${term.pitchSpacing_mm || 5.08}mm pitch) colored in PBT green (${mat.terminalColorHex || '#2E7D32'}) with metallic screws (Metallic: ${mat.metallicScrewsValue || 0.95}). Cut a ${mech.dinRailChannelWidth_mm || 35}mm DIN-rail channel along the bottom casing.
> Set main casing material to Matte ABS Plastic (${mat.bodyColorHex || '#1E1E1E'}, Roughness: ${mat.bodyRoughness || 0.35})."`;

    // 3. Build Executable Production Blender Python (bpy) Script
    const widthM = (mech.width_mm || 96) / 1000.0;
    const heightM = (mech.height_mm || 96) / 1000.0;
    const depthM = (mech.depth_mm || 80) / 1000.0;
    const bevelM = (mech.outerChamferRadius_mm || 2) / 1000.0;

    const screenWM = (disp.screenWidth_mm || 65) / 1000.0;
    const screenHM = (disp.screenHeight_mm || 35) / 1000.0;
    const screenInsetM = (disp.screenInsetDepth_mm || 1.5) / 1000.0;

    const termCount = term.totalCount || 14;
    const pinsPerRow = term.pinsPerRow || 7;
    const pitchM = (term.pitchSpacing_mm || 5.08) / 1000.0;

    const blenderBpyScript = `import bpy
import math

# Clear factory scene objects
bpy.ops.wm.read_factory_settings(use_empty=True)

# Create Main Device Collection
collection = bpy.data.collections.new("${modelName.replace(/[^a-zA-Z0-9_]/g, '_')}_Collection")
bpy.context.scene.collection.children.link(collection)

# Helper function to create materials
def create_material(name, color_hex, roughness=0.4, metallic=0.0, transmission=0.0, ior=1.45):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    
    # Convert HEX to RGBA
    hex_clean = color_hex.lstrip('#')
    r = int(hex_clean[0:2], 16) / 255.0
    g = int(hex_clean[2:4], 16) / 255.0
    b = int(hex_clean[4:6], 16) / 255.0
    
    bsdf.inputs['Base Color'].default_value = (r, g, b, 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    if 'Transmission Weight' in bsdf.inputs:
        bsdf.inputs['Transmission Weight'].default_value = transmission
    elif 'Transmission' in bsdf.inputs:
        bsdf.inputs['Transmission'].default_value = transmission
    if 'IOR' in bsdf.inputs:
        bsdf.inputs['IOR'].default_value = ior
    return mat

# Materials
mat_casing = create_material("Matte_ABS_Casing", "${mat.bodyColorHex || '#1E1E1E'}", roughness=${mat.bodyRoughness || 0.35})
mat_screen = create_material("Acrylic_Screen_Lens", "#101520", roughness=${mat.screenRoughness || 0.05}, transmission=${mat.screenTransmission || 0.92}, ior=${mat.screenIOR || 1.58})
mat_terminal = create_material("PBT_Green_Terminal", "${mat.terminalColorHex || '#2E7D32'}", roughness=0.3)
mat_screw = create_material("Steel_Screw", "#C0C0C0", roughness=0.15, metallic=${mat.metallicScrewsValue || 0.95})
mat_button = create_material("Rubber_Button", "#333333", roughness=0.6)

# 1. Main Casing Body (W=${mech.width_mm || 96}mm, H=${mech.height_mm || 96}mm, D=${mech.depth_mm || 80}mm)
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
body = bpy.context.active_object
body.name = "Device_Main_Body"
body.dimensions = (${widthM}, ${depthM}, ${heightM})
body.data.materials.append(mat_casing)

# Bevel Modifier for Smooth Chamfer Edges
bevel = body.modifiers.new(name="Chamfer_Bevel", type='BEVEL')
bevel.width = ${bevelM}
bevel.segments = 4

# 2. Front Screen Lens Inset (${disp.screenWidth_mm || 65}mm x ${disp.screenHeight_mm || 35}mm)
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, -${depthM / 2.0 - screenInsetM / 2.0}, ${heightM * 0.15}))
screen = bpy.context.active_object
screen.name = "Front_Display_Window"
screen.dimensions = (${screenWM}, ${screenInsetM * 1.5}, ${screenHM})
screen.data.materials.append(mat_screen)

# 3. Front Controls & Pushbuttons (${disp.buttonCount || 4} Buttons)
button_count = ${disp.buttonCount || 4}
btn_diameter = ${(disp.buttonDiameter_mm || 6.5) / 1000.0}
btn_spacing = btn_diameter * 1.8
start_x = -((button_count - 1) * btn_spacing) / 2.0

for i in range(button_count):
    x_pos = start_x + (i * btn_spacing)
    bpy.ops.mesh.primitive_cylinder_add(radius=btn_diameter / 2.0, depth=0.003, location=(x_pos, -${depthM / 2.0 + 0.0015}, -${heightM * 0.25}))
    btn = bpy.context.active_object
    btn.name = f"Button_{i+1}"
    btn.rotation_euler = (math.radians(90), 0, 0)
    btn.data.materials.append(mat_button)

# 4. Rear Terminal Blocks (${termCount} Terminals in 2 Rows)
term_pitch = ${pitchM}
row_count = ${term.rowCount || 2}
pins_per_row = ${pinsPerRow}
start_term_z = -((pins_per_row - 1) * term_pitch) / 2.0

for row in range(row_count):
    side_x = (-${widthM / 2.0 - 0.015}) if row == 0 else (${widthM / 2.0 - 0.015})
    for pin in range(pins_per_row):
        z_pos = start_term_z + (pin * term_pitch)
        
        # Terminal Housing
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=(side_x, ${depthM / 2.0 + 0.005}, z_pos))
        term_housing = bpy.context.active_object
        term_housing.dimensions = (0.010, 0.010, 0.004)
        term_housing.name = f"Terminal_Housing_R{row+1}_P{pin+1}"
        term_housing.data.materials.append(mat_terminal)
        
        # Terminal Screw Head
        bpy.ops.mesh.primitive_cylinder_add(radius=0.002, depth=0.002, location=(side_x, ${depthM / 2.0 + 0.011}, z_pos))
        screw = bpy.context.active_object
        screw.name = f"Terminal_Screw_R{row+1}_P{pin+1}"
        screw.rotation_euler = (math.radians(90), 0, 0)
        screw.data.materials.append(mat_screw)

print("✅ Ultra-Detailed 3D Digital Twin Script Executed Successfully for ${modelName}!")
`;

    return {
      modelName,
      lodLevel: lod,
      completenessScore: score,
      markdownTable,
      claudeMcpPrompt,
      blenderBpyScript,
    };
  }
}

export default BlenderScriptBuilderService;
