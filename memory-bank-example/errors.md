# Errors Log

| Error | Date | Fix |
|---|---|---|
| 403 Forbidden (API) | 2026-03-11 | Attach bearer token app to a Project in Developer Portal |
| UnicodeEncodeError cp1252 | 2026-03-11 | Set `PYTHONIOENCODING=utf-8` |
| RuntimeError: Numpy unavailable | 2026-03-24 | Pin `numpy==1.24.3` (PyTorch 2.0.1 needs <2.0) |
| Conda not found | 2026-03-24 | Use full path: `C:\Users\paulo\miniconda3\condabin\conda.bat` |
| AttributeError: total_mem | 2026-03-25 | Use `total_memory` (PyTorch attr name). Fixed in run_aide.py:153 |
| Silent cluster artifact (clustering) | 2026-04-04 | Retweets carry `impression_count=0` by Twitter API design. Filter `is_retweet==False` before any feature that uses impression_count. RoblesBarrantes 43% of images were retweets; 11/20 "IGA images" were retweets of IGA. |
| 503/403 client-not-enrolled (API) | 2026-04-11 | Bearer token app detached from Project (again — same as 2026-03-11). Tweet endpoints return misleading 503; user/usage endpoints return the real 403 with `reason: client-not-enrolled`. Fix: re-attach app to Project in Developer Portal, or regenerate key. |
