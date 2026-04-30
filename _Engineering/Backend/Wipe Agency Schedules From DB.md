```
mysql> select count(*) from caseloadschedule where caseloadid in ( select id from caseload where agencyid = 'be3a22d3-951b-4adf-8100-ff23dd2f52a0' );
+----------+
| count(*) |
+----------+
|    15231 |
+----------+
1 row in set (0.052 sec)

mysql> delete from caseloadschedule where caseloadid in ( select id from caseload where agencyid = 'be3a22d3-951b-4adf-8100-ff23dd2f52a0' );
Query OK, 15231 rows affected (0.997 sec)

mysql> select count(*) from caseload where agencyid = 'be3a22d3-951b-4adf-8100-ff23dd2f52a0'
    -> ;
+----------+
| count(*) |
+----------+
|       15 |
+----------+
1 row in set (0.036 sec)

mysql> delete from caseload where agencyid = 'be3a22d3-951b-4adf-8100-ff23dd2f52a0'
    -> ;
ERROR 1451 (23000): Cannot delete or update a parent row: a foreign key constraint fails (`heylo`.`caseloadsite`, CONSTRAINT `caseloadsite_ibfk_1` FOREIGN KEY (`CaseloadId`) REFERENCES `caseload` (`Id`))
mysql> delete from caseloadsite where caseloadid in ( select id from caseload where agencyid = 'be3a22d3-951b-4adf-8100-ff23dd2f52a0' );
Query OK, 19 rows affected (0.058 sec)

mysql> delete from caseload where agencyid = 'be3a22d3-951b-4adf-8100-ff23dd2f52a0'
    -> ;
Query OK, 15 rows affected (0.061 sec)
```