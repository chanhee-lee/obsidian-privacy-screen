import { Plugin, MarkdownView, PluginSettingTab, App, Setting } from 'obsidian';
import { EditorView } from '@codemirror/view';

type SpotlightShape = 'circle' | 'square';

interface PrivacyScreenSettings {
	spotlightWidth: number;
	spotlightHeight: number;
	blurIntensity: number;
	featherEdge: number;
	spotlightShape: SpotlightShape;
	squareRoundness: number;
}

const DEFAULT_SETTINGS: PrivacyScreenSettings = {
	spotlightWidth: 200,
	spotlightHeight: 100,
	blurIntensity: 8,
	featherEdge: 50,
	spotlightShape: 'circle',
	squareRoundness: 20
};

export default class PrivacyScreenPlugin extends Plugin {
	settings: PrivacyScreenSettings;
	private overlayEl: HTMLElement | null = null;
	private isActive: boolean = false;

	async onload() {
		await this.loadSettings();

		// Add ribbon icon to toggle privacy screen
		this.addRibbonIcon('eye-off', 'Toggle Privacy Screen', () => {
			this.toggle();
		});

		// Add command to toggle privacy screen
		this.addCommand({
			id: 'toggle-privacy-screen',
			name: 'Toggle privacy screen',
			callback: () => {
				this.toggle();
			}
		});

		// Add settings tab
		this.addSettingTab(new PrivacyScreenSettingTab(this.app, this));

		// Track cursor position via various events
		this.registerDomEvent(document, 'keyup', () => this.trackCursor());
		this.registerDomEvent(document, 'click', () => this.trackCursor());
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => this.trackCursor())
		);
	}

	onunload() {
		this.removeOverlay();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.applySettings();
	}

	private toggle() {
		if (this.isActive) {
			this.removeOverlay();
		} else {
			this.createOverlay();
		}
		this.isActive = !this.isActive;
	}

	private createOverlay() {
		this.overlayEl = document.createElement('div');
		this.overlayEl.addClass('privacy-screen-overlay');
		document.body.appendChild(this.overlayEl);

		this.applySettings();
		this.trackCursor();
	}

	private currentX: number = 0;
	private currentY: number = 0;

	private applySettings() {
		if (!this.overlayEl) return;

		const { blurIntensity } = this.settings;
		this.overlayEl.style.setProperty('--blur-intensity', `${blurIntensity}px`);
		this.updateMask();
	}

	private updateSpotlightPosition(x: number, y: number) {
		this.currentX = x;
		this.currentY = y;
		this.updateMask();
	}

	private updateMask() {
		if (!this.overlayEl) return;

		const { spotlightWidth, spotlightHeight, featherEdge, spotlightShape, squareRoundness } = this.settings;
		const x = this.currentX;
		const y = this.currentY;
		const rx = spotlightWidth / 2;
		const ry = spotlightHeight / 2;

		let maskImage: string;

		switch (spotlightShape) {
			case 'square': {
				const minDimension = Math.min(rx, ry);
				const roundness = (squareRoundness / 100) * minDimension;
				maskImage = this.createSquareMask(x, y, spotlightWidth, spotlightHeight, roundness, featherEdge);
				break;
			}
			case 'circle':
			default: {
				const outerRx = rx + featherEdge;
				const outerRy = ry + featherEdge;
				maskImage = `radial-gradient(ellipse ${rx}px ${ry}px at ${x}px ${y}px, transparent 0%, transparent 100%, black 100%), radial-gradient(ellipse ${outerRx}px ${outerRy}px at ${x}px ${y}px, transparent 0%, black 100%)`;
				break;
			}
		}

		this.overlayEl.style.maskImage = maskImage;
		this.overlayEl.style.webkitMaskImage = maskImage;
	}

	private createSquareMask(cx: number, cy: number, width: number, height: number, roundness: number, feather: number): string {
		const left = cx - width / 2;
		const top = cy - height / 2;
		const outerLeft = left - feather;
		const outerTop = top - feather;
		const outerWidth = width + feather * 2;
		const outerHeight = height + feather * 2;
		const outerRoundness = roundness + feather;

		const svg = `
			<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
				<defs>
					<mask id="spotlight">
						<rect width="100%" height="100%" fill="white"/>
						<rect x="${outerLeft}" y="${outerTop}" width="${outerWidth}" height="${outerHeight}" rx="${outerRoundness}" fill="url(#fade)"/>
						<rect x="${left}" y="${top}" width="${width}" height="${height}" rx="${roundness}" fill="black"/>
					</mask>
					<radialGradient id="fade">
						<stop offset="0%" stop-color="black"/>
						<stop offset="100%" stop-color="white"/>
					</radialGradient>
				</defs>
				<rect width="100%" height="100%" fill="black" mask="url(#spotlight)"/>
			</svg>
		`.replace(/\s+/g, ' ').trim();

		return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
	}

	private trackCursor() {
		if (!this.isActive) return;

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;

		// @ts-ignore - accessing internal CM6 editor
		const editorView: EditorView = view.editor.cm;
		if (!editorView) return;

		const cursorPos = editorView.state.selection.main.head;
		const coords = editorView.coordsAtPos(cursorPos);
		if (!coords) return;

		const centerY = (coords.top + coords.bottom) / 2;
		this.updateSpotlightPosition(coords.left, centerY);
	}

	private removeOverlay() {
		if (this.overlayEl) {
			this.overlayEl.remove();
			this.overlayEl = null;
		}
	}
}

class PrivacyScreenSettingTab extends PluginSettingTab {
	plugin: PrivacyScreenPlugin;

	constructor(app: App, plugin: PrivacyScreenPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Privacy Screen Settings' });

		new Setting(containerEl)
			.setName('Spotlight width')
			.setDesc('Width of the clear area (in pixels)')
			.addSlider(slider => slider
				.setLimits(24, 600, 10)
				.setValue(this.plugin.settings.spotlightWidth)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.spotlightWidth = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Spotlight height')
			.setDesc('Height of the clear area (in pixels)')
			.addSlider(slider => slider
				.setLimits(24, 600, 10)
				.setValue(this.plugin.settings.spotlightHeight)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.spotlightHeight = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Blur intensity')
			.setDesc('How blurry the surrounding area should be (in pixels)')
			.addSlider(slider => slider
				.setLimits(2, 20, 1)
				.setValue(this.plugin.settings.blurIntensity)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.blurIntensity = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Feather edge')
			.setDesc('Softness of the spotlight edge (in pixels)')
			.addSlider(slider => slider
				.setLimits(10, 100, 5)
				.setValue(this.plugin.settings.featherEdge)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.featherEdge = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Spotlight shape')
			.setDesc('Shape of the spotlight area')
			.addDropdown(dropdown => dropdown
				.addOption('circle', 'Circle')
				.addOption('square', 'Square')
				.setValue(this.plugin.settings.spotlightShape)
				.onChange(async (value: SpotlightShape) => {
					this.plugin.settings.spotlightShape = value;
					await this.plugin.saveSettings();
					this.display();
				}));

		if (this.plugin.settings.spotlightShape === 'square') {
			new Setting(containerEl)
				.setName('Corner roundness')
				.setDesc('Roundness of square corners (0 = sharp, 100 = circular)')
				.addSlider(slider => slider
					.setLimits(0, 100, 5)
					.setValue(this.plugin.settings.squareRoundness)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.squareRoundness = value;
						await this.plugin.saveSettings();
					}));
		}
	}
}
