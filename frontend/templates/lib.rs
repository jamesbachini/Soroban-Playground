#![no_std]

use soroban_sdk::{contract, contractimpl, Env};

#[contract]
pub struct ExampleContract;

#[contractimpl]
impl ExampleContract {
    pub fn add(_env: Env, a: i32, b: i32) -> i32 {
        a + b
    }
}

#[cfg(test)]
mod test;
