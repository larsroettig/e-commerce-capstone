async function loadEager(doc) {
	document.documentElement.lang = "en";
	window.adobeDataLayer = window.adobeDataLayer || [];
}

async function loadLazy(document) {}

async function loadDelayed() {}

async function loadPage() {
	await loadEager(document);
	await loadLazy(document);
	loadDelayed();
}

loadPage();
