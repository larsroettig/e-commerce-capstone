export function render(url, ssrManifest) {
	const html = `
          <header class="header">
                <div class="headerlogo">
                    Logo
                </div>
                <nav class="header_nav">
                    <!--nav-html-->
                </nav>

                <cart class="header_cart">
                    <!--cart-html-->
                </cart>
                </header>
        `;
	return { html };
}
