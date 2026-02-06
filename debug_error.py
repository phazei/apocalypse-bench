import sqlite3
import json

conn = sqlite3.connect('runs/apocbench.sqlite')
cursor = conn.cursor()
cursor.execute("""
    SELECT error_json, status, judge_response_json, judge_parsed_json, candidate_completion 
    FROM model_results 
    WHERE run_id='lmstudio-test-20260206-110839'
""")
row = cursor.fetchone()
print('Status:', row[1])
print('Error:', row[0])
print('\nJudge response:', row[2][:1000] if row[2] else 'None')
print('\nJudge parsed:', row[3])
conn.close()
