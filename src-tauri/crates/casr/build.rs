use vergen_gix::{BuildBuilder, CargoBuilder, Emitter, GixBuilder};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Embed build metadata for `casr --version` output.
    // Generates VERGEN_* env vars consumed by option_env!() in main.rs.
    let build = BuildBuilder::default().build_timestamp(true).build()?;
    let cargo = CargoBuilder::default().target_triple(true).build()?;
    let gix = GixBuilder::default().sha(true).build()?;

    Emitter::default()
        .add_instructions(&build)?
        .add_instructions(&cargo)?
        .add_instructions(&gix)?
        .emit()?;

    Ok(())
}
