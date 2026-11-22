// The Rust side injects the managed tmux prefix before any page script runs;
// tests run as the installed app unless they remove it.
Reflect.set(globalThis, "__TERAX_MANAGED_TMUX_PREFIX__", "terax-rs-");

export {};
