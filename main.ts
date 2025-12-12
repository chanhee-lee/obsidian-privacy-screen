import { Plugin, MarkdownView, PluginSettingTab, App, Setting } from 'obsidian';
import { EditorView } from '@codemirror/view';

interface PrivacyScreenSettings {
	spotlightRadius: number;
	blurIntensity: number;
	featherEdge: number;
}

const DEFAULT_SETTINGS: PrivacyScreenSettings = {
	spotlightRadius: 100,
	blurIntensity: 8,
	featherEdge: 50
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

	private applySettings() {
		if (!this.overlayEl) return;

		const { spotlightRadius, blurIntensity, featherEdge } = this.settings;
		this.overlayEl.style.setProperty('--spotlight-radius', `${spotlightRadius}px`);
		this.overlayEl.style.setProperty('--blur-intensity', `${blurIntensity}px`);
		this.overlayEl.style.setProperty('--feather-edge', `${featherEdge}px`);
	}

	private updateSpotlightPosition(x: number, y: number) {
		if (this.overlayEl) {
			this.overlayEl.style.setProperty('--spotlight-x', `${x}px`);
			this.overlayEl.style.setProperty('--spotlight-y', `${y}px`);
		}
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

		this.updateSpotlightPosition(coords.left, coords.top);
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
			.setName('Spotlight radius')
			.setDesc('Size of the clear area around the cursor (in pixels)')
			.addSlider(slider => slider
				.setLimits(50, 300, 10)
				.setValue(this.plugin.settings.spotlightRadius)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.spotlightRadius = value;
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
	}
}
