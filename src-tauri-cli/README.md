# Pi Session Manager CLI

A CLI tool to manage Pi sessions, models, tags, and more.

## Installation

To install the CLI, run:

```bash
cargo install --path .
```

## Usage

To start the server, run:

```bash
pi-session-cli
```

To run a command, run:

```bash
pi-session-cli <command>
```

To specify a port, run:

```bash
pi-session-cli -p <port>
```

## Commands

- `status`: Show server status
- `session`: Session related commands
- `model`: Model related commands
- `tag`: Tag related commands
- `favorite`: Favorite related commands
- `api-key`: API key related commands
- `skill`: Skill related commands
- `prompt`: Prompt related commands
- `settings`: Settings related commands
- `dataset`: Dataset related commands
- `config`: Config related commands
- `search`: Search sessions

## Examples

To list all sessions, run:

```bash
pi-session-cli session list
```

To get a session by path, run:

```bash
pi-session-cli session get -p /path/to/session
```

To delete a session, run:

```bash
pi-session-cli session delete -p /path/to/session
```

To list all models, run:

```bash
pi-session-cli model list
```

To test a model, run:

```bash
pi-session-cli model test -p openai -m gpt-4
```

To list all tags, run:

```bash
pi-session-cli tag list
```

To create a tag, run:

```bash
pi-session-cli tag create -n my-tag -c blue
```

To delete a tag, run:

```bash
pi-session-cli tag delete -i 123
```

To list all favorites, run:

```bash
pi-session-cli favorite list
```

To add a favorite, run:

```bash
pi-session-cli favorite add -i 123 -t session -n my-fav -p /path/to/session
```

To remove a favorite, run:

```bash
pi-session-cli favorite remove -i 123
```

To list all API keys, run:

```bash
pi-session-cli api-key list
```

To create an API key, run:

```bash
pi-session-cli api-key create -n my-key -k sk-123
```

To revoke an API key, run:

```bash
pi-session-cli api-key revoke -k sk-123
```

To scan all skills, run:

```bash
pi-session-cli skill scan
```

To get a skill by path, run:

```bash
pi-session-cli skill get -p /path/to/skill
```

To scan all prompts, run:

```bash
pi-session-cli prompt scan
```

To get a prompt by path, run:

```bash
pi-session-cli prompt get -p /path/to/prompt
```

To load settings, run:

```bash
pi-session-cli settings load
```

To save settings, run:

```bash
pi-session-cli settings save -s '{"key":"value"}'
```

To list all datasets, run:

```bash
pi-session-cli dataset list
```

To start a dataset import, run:

```bash
pi-session-cli dataset import -s /path/to/dataset
```

To load config, run:

```bash
pi-session-cli config load
```

To save config, run:

```bash
pi-session-cli config save -c '{"key":"value"}'
```

To search sessions, run:

```bash
pi-session-cli search "my query"
```

## Troubleshooting

If you get an "Address already in use" error, it means that the server is already running. You can either stop the existing server or run the CLI with a different port.

To run the CLI with a different port, run:

```bash
pi-session-cli -p <port>
```
