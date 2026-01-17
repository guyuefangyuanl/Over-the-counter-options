import unittest

from sina_quotes import _normalize_fullcode, parse_sina_hq, _fields_to_quote


class SinaQuotesTestCase(unittest.TestCase):
    def test_normalize_fullcode(self):
        self.assertEqual(_normalize_fullcode("600519"), "sh600519")
        self.assertEqual(_normalize_fullcode("000001"), "sz000001")
        self.assertEqual(_normalize_fullcode("sz000001"), "sz000001")
        self.assertIsNone(_normalize_fullcode("12345"))

    def test_parse_sina_hq(self):
        raw = 'var hq_str_sh600519="贵州茅台,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,2025-12-25,15:00:00,32";\n'
        parsed = parse_sina_hq(raw)
        self.assertIn("sh600519", parsed)
        self.assertEqual(parsed["sh600519"][0], "贵州茅台")

    def test_fields_to_quote(self):
        fields = [
            "平安银行",
            "10.00",
            "9.50",
            "10.45",
            "10.60",
            "9.80",
            "0",
            "0",
            "1000",
            "500000",
        ] + ["0"] * 20 + ["2025-12-25", "15:00:00"]

        q = _fields_to_quote("sz000001", fields)
        self.assertIsNotNone(q)
        assert q is not None
        self.assertEqual(q.stock_code, "000001")
        self.assertEqual(q.name, "平安银行")
        self.assertAlmostEqual(q.price or 0, 10.45)
        self.assertAlmostEqual(q.pre_close or 0, 9.5)
        self.assertIsNotNone(q.change_percent)


if __name__ == "__main__":
    unittest.main()

