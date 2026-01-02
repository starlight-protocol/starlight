# Starlight Part 3: The Autonomous Era

## From Watching to Running — Unattended Automation

In Part 2, we explored **Mission Control**—the visual dashboard that lets you monitor the Starlight constellation in real-time. But in practice, most enterprise automation runs in CI/CD pipelines, headless, in the background.

**This is Starlight v3.0: The Autonomous Era.**

We've moved beyond visibility. The constellation can now sense its environment and run without human intervention.

---

## 🧬 Stability Sensing: Knowing When the Page is Ready

The hardest problem in browser automation isn't clicking a button—it's knowing *when* to click. Traditional scripts use arbitrary waits like `wait_for_timeout(3000)`, which are either too slow or too fast.

Starlight v3.0 introduces **Mutation Fingerprinting** to solve this.

When you record a test using the built-in recorder, Starlight doesn't just capture your clicks. It also measures how long the page takes to "settle" after each action using the browser's MutationObserver API.

For example, if a page needs 450ms of DOM silence before it's truly stable, that timing is saved with the action. During playback, the **Pulse Sentinel** uses this data to wait exactly the right amount of time—no more, no less.

**The result:** Tests that are fast when they can be, and patient when they need to be.

---

## 🤖 One Command to Run Everything

Running a multi-agent system used to mean opening multiple terminals: one for the Hub, one for each Sentinel, and one for your test. That's a lot of moving pieces.

With v3.0, we've simplified this to a single command:

```bash
node bin/starlight.js test/my_mission.js --headless
```

The **CLI Orchestrator** handles the lifecycle automatically:
1. Starts the Hub and waits for it to be ready
2. Launches the Sentinels (Pulse, Janitor, etc.)
3. Runs your test
4. Generates the report and cleans up

This makes Starlight straightforward to integrate into GitHub Actions, GitLab CI, or any CI/CD pipeline.

---

## 🏷️ The No-Code Recorder

The test recorder has been upgraded with an in-browser HUD (Heads-Up Display). When you start a recording from Mission Control, a small floating panel appears on the page.

**What you can do:**
- **Tag Next Click**: Give a meaningful name to your next action (e.g., "Login Button" instead of a raw selector)
- **Add Checkpoints**: Insert named markers like "Cart Updated" to track logical milestones
- **Stop Recording**: End the session and save the generated test file

This lets you create tests by interacting with your site normally, while adding semantic meaning where it matters.

---

## 📋 What's New in v3.0.1

The latest patch fixed an issue where the checkpoint and stop buttons in the HUD weren't responding. The fix involved:
- Replacing browser-native dialogs (which Playwright intercepts) with in-HUD controls
- Ensuring recording functions are available before page navigation
- Using a fresh browser instance for each recording session

These are the kinds of edge cases you discover when building automation tools—the automation framework was automating away its own UI dialogs.

---

## 🌌 When to Use Starlight

Starlight is designed for complex, dynamic web applications where:
- Pages have frequent DOM changes (animations, lazy loading)
- Unexpected popups and modals appear
- Selectors change due to dynamic IDs or framework updates
- You need detailed reports showing what happened during a test

For simple, static sites, traditional automation tools work fine. Starlight shines when the environment is unpredictable.

---

## 🔮 What's Next for Starlight

We have a clear roadmap for where Starlight is heading:

**Observability & Telemetry (Phase 10)**
- OpenTelemetry integration to export traces to tools like Datadog and Grafana
- Slack/Teams webhooks for real-time failure notifications
- SLA dashboards tracking mission success rates and mean-time-to-repair

**Natural Language Intent (Phase 13)**
- Write tests in plain English: "Login and add the first product to cart"
- Parse Gherkin `.feature` files directly into Starlight missions
- Auto-generate BDD scenarios from successful test recordings

**Sentinel Marketplace (Phase 15)**
- A community registry where developers can share custom Sentinels
- One-command installation: `starlight install payment-sentinel`
- Visual editor for building Sentinels without writing Python code
- Enterprise-ready plugins

The foundation we've built—the Hub, Sentinels, and the Starlight Protocol—is designed to be extensible. The marketplace will let teams share solutions for common obstacles (cookie banners, CAPTCHA handlers, login flows) rather than solving them from scratch.

---

## Next Steps

If you're interested in trying Starlight or contributing to the project:
1. Clone the [repository](https://github.com/godhiraj-code/cba)
2. Run `npm install` and `pip install -r requirements.txt`
3. Start Mission Control: `node launcher/server.js`
4. Open `http://localhost:3000` and explore

---

*Built by [Dhiraj Das](https://www.dhirajdas.dev)*
