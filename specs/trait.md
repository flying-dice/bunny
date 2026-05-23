# Feature: `trait` keyword

**Scope:** semantics of the `trait` keyword in the language

## Declaration
- **Given** the `trait` keyword followed by a name, **when** a body of member signatures is provided, **then** a new trait is defined that types can implement.
- **Given** a trait body, **when** it lists method signatures without bodies, **then** those become required members any implementer must provide.
- **Given** a trait body, **when** a method includes a default body, **then** implementers may use it as-is or override it.

## Implementation
- **Given** a type and a trait, **when** the type implements the trait, **then** it must define every required member.
- **Given** a type implementing a trait, **when** a required member is missing, **then** it is a compile error.
- **Given** a type, **when** it implements multiple traits, **then** all of their members are available on that type.

## Usage
- **Given** a value whose type implements a trait, **when** a trait member is called on it, **then** the type's implementation runs.
- **Given** a trait used as a parameter type, **when** a function accepts it, **then** any implementing type may be passed.

## Constraints
- **Given** two traits, **when** both define a member with the same name, **then** an implementer must resolve the conflict explicitly.
- **Given** a trait, **when** a type claims to implement it but signatures don't match, **then** it is a compile error.
