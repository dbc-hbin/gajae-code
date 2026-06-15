import { afterEach, describe, expect, it } from "bun:test";
import { Settings } from "../../src/config/settings";
import type { ToolSession } from "../../src/tools";
import { LinuxComputerUseTool } from "../../src/tools/linux-computer-use";

const originalFetch = globalThis.fetch;

function makeSession(baseUrl = "http://lcu.local:8765"): ToolSession {
	return {
		cwd: "/tmp",
		hasUI: false,
		settings: Settings.isolated({ "linuxComputerUse.baseUrl": baseUrl }),
		getSessionFile: () => null,
		getSessionSpawns: () => null,
	} as unknown as ToolSession;
}

describe("LinuxComputerUseTool", () => {
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("returns observation metadata and an inline screenshot image", async () => {
		const calls: Array<{ url: string; init?: RequestInit }> = [];
		globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
			calls.push({ url: String(input), init });
			return Response.json({
				backend: "x11",
				width: 1280,
				height: 720,
				display: ":99",
				mime_type: "image/png",
				screenshot_base64: Buffer.from("png").toString("base64"),
			});
		}) as typeof fetch;

		const tool = new LinuxComputerUseTool(makeSession());
		const result = await tool.execute("call", { action: "observe" });

		expect(calls).toEqual([
			{
				url: "http://lcu.local:8765/observe",
				init: { method: "GET", headers: expect.any(Headers), signal: undefined },
			},
		]);
		expect(result.details).toMatchObject({ action: "observe", backend: "x11", width: 1280, height: 720 });
		expect(result.content[0]).toMatchObject({ type: "text", text: expect.stringContaining("backend: x11") });
		expect(result.content[1]).toMatchObject({ type: "image", mimeType: "image/png" });
	});

	it("posts actions to act-and-observe and summarizes action observations", async () => {
		let postedBody: unknown;
		globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
			postedBody = init?.body ? JSON.parse(String(init.body)) : undefined;
			return Response.json({
				results: [{ ok: true, message: "ok" }],
				observation: { backend: "x11", width: 800, height: 600 },
			});
		}) as typeof fetch;

		const tool = new LinuxComputerUseTool(makeSession());
		const result = await tool.execute("call", {
			action: "act_and_observe",
			actions: [{ type: "wait", ms: 100 }],
		});

		expect(postedBody).toEqual({ actions: [{ type: "wait", ms: 100 }], observe: true });
		expect(result.details).toMatchObject({ action: "act_and_observe", width: 800, height: 600 });
		expect(result.content).toHaveLength(1);
	});
});
