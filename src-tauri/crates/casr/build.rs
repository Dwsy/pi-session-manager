use vergen_gitcl::{Build, Cargo, Emitter, Gitcl};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Re-run when staged/release builds pass an explicit VERGEN_GIT_SHA override.
    println!("cargo:rerun-if-env-changed=VERGEN_GIT_SHA");

    // Embed build metadata for `casr --version` output.
    // Generates VERGEN_* env vars consumed by env!() in main.rs.
    let build = Build::builder().build_timestamp(true).build();
    let cargo = Cargo::builder().target_triple(true).build();
    let gitcl = Gitcl::builder().sha(true).build();

    Emitter::default()
        .default_on_error()
        .add_instructions(&build)?
        .add_instructions(&cargo)?
        .add_instructions(&gitcl)?
        .emit()?;

    Ok(())
}
