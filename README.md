# Obsidian Canvas AI

<p align=center>
Obsidian Canvas AI Plugin
</p>

<br>

<p align=center>
<b>English</b> • <a href="https://github.com/HinxCorporation/obsidian-canvas-ai/blob/master/README-zh.md">简体中文</a>
</p>

<br>

## Roadmap of Features

- [x] Generate AI Q&A cards within Canvas
- [x] Configure the model's API key (currently only supports DeepSeek)
- [x] Custom instructions
- [ ] Create special Canvas cards as custom instructions
- [ ] Implement multi-turn conversations in Canvas
- [ ] Support for more LLMs.
- [ ] Explain content and relationships in Canvas
- [ ] More...

### Supported Large Language Models

| Model     | Supported |
| -------- | ---------- |
| Deepseek | ✅         |
| ChatGPT  | ❌         |
| ...      | ...        |

## How to Install

### 1. Install from the Obsidian Plugin Market (Not yet)

### 2. Download from Release

- Download the latest version from the [releases](https://github.com/HinxCorporation/obsidian-canvas-ai/releases/tag/0.1.0)
- Extract the three files (main.js, manifest.json, styles.css) and place them in the folder `{{obsidian_vault}}/.obsidian/plugins/obsidian-canvas-ai`

## Usage

## FAQ

## Contributing

### Build Guide

- Navigate to the plugin folder in the Obsidian vault

```shell
cd {{obsidian_vault}}/.obsidian/plugins/
```

- Clone this repository from Github into the current directory

```shell
git clone https://github.com/HinxCorporation/obsidian-canvas-ai.git
```

- Enter the plugin directory, install the required dependencies, and debug/build

```shell
cd obsidian-canvas-ai

# Debug
yarn && yarn dev

# Build
yarn && yarn build
```
