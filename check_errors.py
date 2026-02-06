#!/usr/bin/env python3
"""
Quick utility to check errors from apocalypse-bench runs stored in SQLite.
Usage: python check_errors.py [run_id]
  - If no run_id provided, shows the most recent run with errors
"""
import sqlite3
import json
import sys
import io

# Force UTF-8 output
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

DB_PATH = 'd:/aitools/apocalypse-bench/runs/apocbench.sqlite'

def main():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Get run_id from args or find the most recent one
    if len(sys.argv) > 1:
        run_id = sys.argv[1]
    else:
        # First try to get most recent run with errors
        cursor.execute("""
            SELECT DISTINCT run_id FROM model_results 
            WHERE error_json IS NOT NULL 
            ORDER BY run_id DESC LIMIT 1
        """)
        result = cursor.fetchone()
        
        if not result:
            # If no errors, show the most recent run
            cursor.execute("""
                SELECT DISTINCT run_id FROM model_results 
                ORDER BY run_id DESC LIMIT 1
            """)
            result = cursor.fetchone()
            if result:
                run_id = result[0]
                print(f"No errors found. Showing most recent run: {run_id}\n")
            else:
                print("No runs found in database.")
                conn.close()
                return
        else:
            run_id = result[0]
    
    print(f"=== Results for run: {run_id} ===\n")
    
    # Get all results for this run
    cursor.execute("""
        SELECT question_id, model_id, error_json, candidate_completion, status, score_overall
        FROM model_results 
        WHERE run_id = ?
        ORDER BY question_id
    """, (run_id,))
    
    rows = cursor.fetchall()
    if not rows:
        print(f"No results found for run_id: {run_id}")
        # List available runs
        cursor.execute("SELECT DISTINCT run_id FROM model_results ORDER BY run_id DESC LIMIT 10")
        runs = cursor.fetchall()
        if runs:
            print("\nRecent runs:")
            for r in runs:
                print(f"  - {r[0]}")
    else:
        errors = [r for r in rows if r[2] is not None]
        successes = [r for r in rows if r[2] is None]
        
        if successes:
            print(f"✓ Successful: {len(successes)}/{len(rows)}")
            for question_id, model_id, _, candidate_completion, status, score_overall in successes:
                score_str = f"{score_overall:.1f}" if score_overall is not None else "N/A"
                print(f"  {question_id} | {model_id} | Score: {score_str}")
        
        if errors:
            print(f"\n✗ Errors: {len(errors)}/{len(rows)}\n")
            for question_id, model_id, error_json, candidate_completion, status, _ in errors:
                print(f"--- Question: {question_id} | Model: {model_id} | Status: {status} ---")
                if error_json:
                    try:
                        error = json.loads(error_json)
                        print(f"Error: {json.dumps(error, indent=2)}")
                    except json.JSONDecodeError:
                        print(f"Error (raw): {error_json}")
                if candidate_completion:
                    # Safely truncate with ellipsis
                    preview = candidate_completion[:500]
                    if len(candidate_completion) > 500:
                        preview += "..."
                    print(f"\nCandidate response preview:\n{preview}")
                print()
        
        if not errors:
            print("\n✓ No errors in this run!")
    
    conn.close()

if __name__ == "__main__":
    main()
