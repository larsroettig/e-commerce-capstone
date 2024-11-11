import fs from "node:fs/promises";
import express from "express";
import sharp from "sharp";
import crypto from "node:crypto";
// Constants
const isProduction = process.env.NODE_ENV === "production";
const port = process.env.PORT || 5173;
const base = process.env.BASE || "/";

// Cached production assets
const templateHtml = isProduction
	? await fs.readFile("./dist/client/index.html", "utf-8")
	: "";

const ssrManifest = isProduction
	? await fs.readFile("./dist/client/.vite/ssr-manifest.json", "utf-8")
	: undefined;

// Create http server
const app = express();

// Add Vite or respective production middlewares
let vite;
if (!isProduction) {
	const { createServer } = await import("vite");
	vite = await createServer({
		server: { middlewareMode: true },
		appType: "custom",
		base,
	});
	app.use(vite.middlewares);
} else {
	const compression = (await import("compression")).default;
	const sirv = (await import("sirv")).default;
	app.use(compression());
	app.use(base, sirv("./dist/client", { extensions: [] }));
}

const routes = {
	"/": "home",
	"/c/[slug]": "category",
	"/p/[slug]": "product",
};

const loadPage = async (template, req, res, params = {}) => {
	let header;
	let footer;
	let mainTemplate;
	let pageTemplate;
	let render;
	const url = req.originalUrl.replace(base, "");

	try {
		if (!isProduction) {
			// Always read fresh template in development
			mainTemplate = await fs.readFile("./index.html", "utf-8");
			mainTemplate = await vite.transformIndexHtml(url, mainTemplate);
			pageTemplate = await fs.readFile(
				`./src/edge-delivery/${template}/${template}.html`,
				"utf-8",
			);
			pageTemplate = await vite.transformIndexHtml(url, pageTemplate);
			render = (
				await vite.ssrLoadModule(
					`./src/edge-delivery/${template}/${template}.js`,
				)
			).render;
		} else {
			console.log("Production Mode not implemented yet");
			return res.status(500).end("Production Mode not implemented yet");
		}

		const rendered = await render(url, ssrManifest, pageTemplate, params);

		header = (
			await vite.ssrLoadModule(
				"./src/edge-delivery/blocks_ssr/header/header.js",
			)
		).render(url, ssrManifest);

		footer = (
			await vite.ssrLoadModule(
				"./src/edge-delivery/blocks_ssr/footer/footer.js",
			)
		).render(url, ssrManifest);

		const html = mainTemplate
			.replace("<!--app-head-->", rendered.head ?? "")
			.replace("<!--app-html-->", rendered.html ?? "")
			.replace("<!--app-header-->", header.html ?? "")
			.replace("<!--app-footer-->", footer.html ?? "");

		res.status(200).set({ "Content-Type": "text/html" }).send(html);
	} catch (e) {
		vite?.ssrFixStacktrace(e);
		console.log(e.stack);
		return res.status(500).end(e.stack);
	}
};

const generateCacheKey = (originalName, width, height, quality, format) => {
	const hash = crypto
		.createHash("md5")
		.update(originalName)
		.update(width.toString())
		.update(height.toString())
		.update(quality.toString())
		.update(format.toString())
		.digest("hex");
	return `${hash}.${format}`;
};

app.get("/optimize/:imageName", async (req, res) => {
	try {
		const imageName = req.params.imageName;
		const width = Number.parseInt(req.query.width) || 800;
		const height = Number.parseInt(req.query.height) || 600;
		const quality = Number.parseInt(req.query.quality) || 80;
		const format = req.query.format || "jpg"; // Default to JPG

		// Validate format to prevent malicious input
		const validFormats = ["jpg", "jpeg", "png", "webp"];
		if (!validFormats.includes(format)) {
			return res.status(400).send("Invalid format");
		}

		const cacheKey = generateCacheKey(
			imageName,
			width,
			height,
			quality,
			format,
		);
		const cachePath = `./cache/${cacheKey}`;

		try {
			const cachedImage = await fs.readFile(cachePath);
			res.set("Content-Type", `image/${format}`);
			return res.send(cachedImage);
		} catch (err) {
			// Image not in cache, process it
			let image = sharp(`./public/${imageName}`);

			image = image.resize(width, height, {
				fit: sharp.fit.inside,
				withoutEnlargement: true,
			});

			// Set output format based on the 'format' query parameter
			switch (format) {
				case "png":
					image = image.png();
					break;
				case "webp":
					image = image.webp({ quality });
					break;
				default: // jpg or jpeg
					image = image.jpeg({ quality });
			}

			const optimizedImageBuffer = await image.toBuffer();

			await fs.writeFile(cachePath, optimizedImageBuffer);

			res.set("Content-Type", `image/${format}`);
			res.send(optimizedImageBuffer);
		}
	} catch (error) {
		console.error(error);
		res.status(500).send("Image processing error.");
	}
});

app.get("/", (req, res) => {
	// Load the homepage
	loadPage("home", req, res);
});

app.get("/p/:sku", (req, res) => {
	const sku = req.params.sku;
	loadPage("product", req, res, { sku });
});

app.get("/c/:slug", (req, res) => {
	const id = req.params.slug;
	loadPage("product", req, res, { id });
});

app.use((req, res) => {
	res.status(404).send("Page not found");
});

// Start http server
app.listen(port, () => {
	console.log(`Server started at http://localhost:${port}`);
});
