import { describe, it, expect } from "vitest";
import { BlenderScriptBuilderService } from "../services/blenderScriptBuilder.service";

const builder = new BlenderScriptBuilderService();

describe("BlenderScriptBuilderService.build3DPrompt", () => {
  it("returns all expected output sections", () => {
    const out = builder.build3DPrompt({});
    expect(out).toHaveProperty("modelName");
    expect(out).toHaveProperty("lodLevel");
    expect(out).toHaveProperty("completenessScore");
    expect(out).toHaveProperty("markdownTable");
    expect(out).toHaveProperty("artDirectorBrief");
    expect(out).toHaveProperty("claudeMcpPrompt");
    expect(out).toHaveProperty("blenderBpyScript");
    expect(out).toHaveProperty("images");
  });

  it("applies sensible defaults when specs are empty", () => {
    const out = builder.build3DPrompt({});
    expect(out.modelName).toBe("Industrial Device");
    expect(out.lodLevel).toBe("LoD 3");
    expect(out.completenessScore).toBe(90);
    expect(out.images).toEqual([]);
  });

  it("reflects provided top-level spec values", () => {
    const out = builder.build3DPrompt({
      modelName: "ACME Power Meter 3000",
      lodLevel: "LoD 2",
      completenessScore: 77,
    });
    expect(out.modelName).toBe("ACME Power Meter 3000");
    expect(out.lodLevel).toBe("LoD 2");
    expect(out.completenessScore).toBe(77);
    expect(out.markdownTable).toContain("LoD 2");
    expect(out.markdownTable).toContain("77%");
  });

  it("embeds mechanical dimensions into the markdown table and bpy script", () => {
    const out = builder.build3DPrompt({
      mechanical: { width_mm: 120, height_mm: 110, depth_mm: 90 },
    });
    expect(out.markdownTable).toContain("120 mm");
    expect(out.markdownTable).toContain("110 mm");
    expect(out.markdownTable).toContain("90 mm");
    // 120mm -> 0.12m in the generated Blender script
    expect(out.blenderBpyScript).toContain("0.12");
  });

  it("produces a syntactically plausible Blender python script", () => {
    const out = builder.build3DPrompt({});
    expect(out.blenderBpyScript).toContain("import bpy");
    expect(out.blenderBpyScript).toContain("def create_material");
    expect(out.blenderBpyScript).toContain("primitive_cube_add");
  });

  it("sanitizes the model name for the collection identifier", () => {
    const out = builder.build3DPrompt({ modelName: "X-100 / Rev.2" });
    // Non-alphanumerics are replaced with underscores in the collection name.
    expect(out.blenderBpyScript).toContain("X_100___Rev_2_Collection");
  });

  it("passes through supplied image URLs", () => {
    const imgs = ["http://x/a.jpg", "http://x/b.jpg"];
    const out = builder.build3DPrompt({}, imgs);
    expect(out.images).toEqual(imgs);
  });

  it("renders custom terminal silkscreen labels", () => {
    const out = builder.build3DPrompt({
      terminals: { silkscreenLabels: ["L1", "L2", "N"] },
    });
    expect(out.markdownTable).toContain("L1");
    expect(out.markdownTable).toContain("L2");
    expect(out.artDirectorBrief).toContain("N");
  });
});
