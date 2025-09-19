use soroban_sdk::Env;
use crate::{ExampleContract, ExampleContractClient};

#[test]
fn example_unit_test() {
    let env = Env::default();
    let contract_id = env.register(ExampleContract, ());
    let client = ExampleContractClient::new(&env, &contract_id);

    let a = 5_i32;
    let b = 7_i32;
    let result = client.add(&a, &b);

    assert_eq!(result, 12);
}
