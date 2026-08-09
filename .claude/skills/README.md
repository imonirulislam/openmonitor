# Skills for AI agents

Each skill is a prompt that captures *how* a recurring task should be done in this codebase,
so changes stay consistent across sessions and agents.

| Skill | When to use |
|---|---|
| [add-monitor](add-monitor/SKILL.md) | Adding a new HTTP probe target |
| [add-notification-channel](add-notification-channel/SKILL.md) | Adding a new transport (email, PagerDuty, MS Teams) alongside Slack |
| [add-auth-provider](add-auth-provider/SKILL.md) | Wiring up Google / JumpCloud / Okta / generic OIDC SSO |
| [add-event-type](add-event-type/SKILL.md) | New state transition that should fire a notification |
| [add-app-or-package](add-app-or-package/SKILL.md) | Scaffolding a new app or shared package |
| [run-locally](run-locally/SKILL.md) | Bootstrapping local dev |

If you find yourself rederiving "how do I X in this codebase" more than once, write a new
skill rather than answering from scratch each time. Skills are short, opinionated, and
tell agents what NOT to do as well as what to do.
