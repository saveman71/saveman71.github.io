---
layout: post
title: "Fixing Flaky Elixir Tests with Randomized Query Ordering"
date: 2025-08-30 13:12:42 +0100
categories: elixir postgres testing flaky-tests ecto random
---

Flaky tests are the bane of a developer's existence - they pass locally but fail in CI, or worse, pass 9 times out of 10 only to mysteriously fail when you least expect it. A failing CI build leads to fatigue and frustration for everyone involved, so any flaky test should be analyzed and fixed.

We quickly understood that a good part of those flaky tests had the same root cause: database queries without explicit ordering.

# The Problem: Unstable Sorting in Database Queries

When we write a query like this:

```elixir
Repo.all(from u in User)
```

SQL makes no such guarantee unless you explicitly specify an `ORDER BY` clause. However, since PostgreSQL often returns results in the same order due to how data is stored and accessed, this lead to subtle bugs in tests: we might write assertions that expect specific ordering, and they'll pass most of the time by coincidence.

But occasionally, when database statistics change or PostgreSQL chooses a different query plan, the order will change and our tests will fail. These are the dreaded flaky tests. Surprisingly, it happens more often in the CI than locally, leading to hard to reproduce failures.

# A proposed solution: Enforcing Randomness

I came up with a solution that's both simple and effective: what if we could make the ordering explicitly random during tests? This would turn intermittent failures into consistent ones, forcing us to fix the underlying issues.

Here's the trick - we can override Ecto's `prepare_query/3` callback to add a `ORDER BY RANDOM()` to any query that doesn't already have an ordering specified:

```elixir
defmodule WebApp.Repo do
  @doc """
  Testing helper that enforces sorts in tests/queries. It helps tracking flaky tests and will make them more obvious as the order won't
  be stable unless an order_by clause is specified.
  """
  if Mix.env() == :test do
    @impl true
    def prepare_query(operation, query, opts) when operation == :all do
      query =
        if query.order_bys == [] and is_nil(query.distinct) and query.combinations == [] do
          import Ecto.Query
          order_by(query, fragment("RANDOM()"))
        else
          query
        end

      {query, opts}
    end

    def prepare_query(_operation, query, opts) do
      {query, opts}
    end
  end
end
```

This implementation uses the `prepare_query/3` callback from [Ecto.Repo](https://hexdocs.pm/ecto/Ecto.Repo.html#c:prepare_query/3), which allows us to transform queries before they're executed. When it detects a query without ordering, it adds `ORDER BY RANDOM()` (excluding some specific queries such as `DISTINCT` which don't support/require ordering, naturally).

The beauty of this approach is that it only affects your test environment and even prevents new flaky tests from being introduced - they'll fail immediately during development rather than randomly in CI months later.

# Finding All the Flaky Tests

With our new randomized ordering in place, we'll quickly discover tests that were silently depending on implicit ordering. But there's a catch - since the ordering is random, we need to run our test suite multiple times to catch all the issues.

Since I knew about the `mix test --failed` command, which runs tests that just failed, I knew there was some kind of _manifest_ somewhere that would store the failing tests on disk. After some digging, I discovered it was in the `_build` directory, more specifically in the `_build/test/lib/webapp/.mix/.mix_test_failures` file.

So let's write a script to capture these failures and store them in a more stable file:

{% raw %}
```elixir
defmodule AddStableFailures do
  # The initial failed manifest
  @failed_manifest "_build/test/lib/webapp/.mix/.mix_test_failures"
  # The file to store persistent failures
  @stable_manifest "stable_failures"

  def run do
    if not File.exists?(@failed_manifest) do
      IO.puts("Failed manifest file not found: #{@failed_manifest}")
      System.stop()
    end

    failed_tests =
      @failed_manifest
      |> File.read!()
      |> :erlang.binary_to_term()
      |> elem(1)
      |> Enum.group_by(fn {_, file} -> file end, fn {{_mod, name}, _file} -> name end)

    existing_stable_failures = read_stable_failures()

    new_stable_failures =
      Enum.reduce(failed_tests, existing_stable_failures, fn {file, tests}, acc ->
        Enum.reduce(tests, acc, fn test_name, acc ->
          entry = {file, test_name}

          if Enum.member?(acc, entry) do
            IO.puts("Test already in stable manifest: #{test_name} from #{file}")
            acc
          else
            IO.puts("Adding stable failure: #{test_name} from #{file}")
            [entry | acc]
          end
        end)
      end)

    # Write the entire list back to the file as a single term.
    write_stable_failures(new_stable_failures)
  end

  defp write_stable_failures(terms) do
    File.write!(@stable_manifest, :erlang.term_to_binary(terms))
  end

  defp read_stable_failures do
    case File.read(@stable_manifest) do
      {:ok, binary} -> :erlang.binary_to_term(binary)
      {:error, :enoent} -> []
    end
  end
end

AddStableFailures.run()
```
{% endraw %}

Here's how to use it:

1. Run your test suite: `mix test`, some but not all flaky tests will fail.
2. Run this script to capture failures: `elixir accumulate_failures.exs`
3. Repeat steps 1-2 several times to build up a complete list

After a few iterations, you'll have a pretty comprehensive list of all the tests affected by ordering issues.

# Fixing the Tests

Once you've identified the flaky tests, fixing them is usually straightforward:

1. Add explicit ordering to your queries:
   ```elixir
   # Before
   users = Repo.all(from u in User)

   # After
   users = Repo.all(from u in User, order_by: u.id)
   ```

2. Sort results in memory if the order doesn't matter for the database:
   ```elixir
   # Before
   assert [user1, user2, user3] = Repo.all(User)

   # After
   assert Enum.sort_by([user1, user2, user3], & &1.id) == Enum.sort_by(Repo.all(User), & &1.id)
   ```

3. Remove order dependence from the test if possible:
   ```elixir
   # Before
   assert [%{name: "Alice"}, %{name: "Bob"}] = result

   # After
   assert Enum.count(result) == 2
   assert Enum.any?(result, &(&1.name == "Alice"))
   assert Enum.any?(result, &(&1.name == "Bob"))
   ```

# The Results

After implementing this approach at work, we quickly identified and fixed a dozen of flaky tests, most having never been seen before. Our CI became more reliable which is always a good thing.

What's more, this approach catches potential flaky tests during development. When a developer writes a new test that implicitly depends on ordering, it fails immediately (well, it's still random so it might take a few runs) on their machine rather than randomly in CI weeks later.

As an added bonus, we've made our codebase more robust by adding explicit ordering at places we had forgotten about.

# Conclusion

Flaky tests cause a lot of frustration, but they are surprisingly easy to fix once you know what to look for. A good first thing is to ask your team to start tracking failing builds so you can start accumulating data on the frequency and nature of these issues. This will help you prioritize fixes and ensure that your CI pipeline remains stable over time.
