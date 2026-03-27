#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
图片使用情况分析工具
扫描项目中所有图片引用，识别未使用的图片资源
"""

import os
import re
import json
from pathlib import Path
from collections import defaultdict

class ImageUsageAnalyzer:
    def __init__(self, project_root):
        self.project_root = Path(project_root)
        self.images_dir = self.project_root / 'images'
        self.miniprogram_dir = self.project_root / 'miniprogram'

        # 存储所有图片文件
        self.all_images = set()
        # 存储被引用的图片
        self.referenced_images = set()
        # 存储图片引用详情
        self.reference_details = defaultdict(list)

    def scan_all_images(self):
        """扫描images目录下所有图片文件"""
        if not self.images_dir.exists():
            print(f"❌ images目录不存在: {self.images_dir}")
            return

        image_extensions = {'.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'}

        for file_path in self.images_dir.rglob('*'):
            if file_path.is_file() and file_path.suffix.lower() in image_extensions:
                # 存储相对路径
                relative_path = file_path.relative_to(self.images_dir)
                self.all_images.add(str(relative_path))

        print(f"✅ 扫描到 {len(self.all_images)} 个图片文件")

    def find_image_references_in_file(self, file_path):
        """在单个文件中查找图片引用"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception as e:
            print(f"⚠️  无法读取文件 {file_path}: {e}")
            return []

        references = []

        # 匹配模式1: /images/path/to/image.png
        pattern1 = r'/images/([^\s"\'\)\}\]]+)'
        matches1 = re.findall(pattern1, content)
        references.extend(matches1)

        # 匹配模式2: images/path/to/image.png (不带前导斜杠)
        pattern2 = r'["\']images/([^"\']+)["\']'
        matches2 = re.findall(pattern2, content)
        references.extend(matches2)

        # 匹配模式3: url(images/...) 在CSS中
        pattern3 = r'url\(["\']?images/([^"\')]+)["\']?\)'
        matches3 = re.findall(pattern3, content)
        references.extend(matches3)

        # 匹配模式4: url(/images/...) 在CSS中
        pattern4 = r'url\(["\']?/images/([^"\')]+)["\']?\)'
        matches4 = re.findall(pattern4, content)
        references.extend(matches4)

        return references

    def scan_miniprogram_files(self):
        """扫描miniprogram目录下所有相关文件"""
        if not self.miniprogram_dir.exists():
            print(f"❌ miniprogram目录不存在: {self.miniprogram_dir}")
            return

        file_extensions = {'.wxml', '.wxss', '.js', '.json'}

        scanned_files = 0
        for file_path in self.miniprogram_dir.rglob('*'):
            if file_path.is_file() and file_path.suffix.lower() in file_extensions:
                # 跳过node_modules
                if 'node_modules' in str(file_path):
                    continue

                references = self.find_image_references_in_file(file_path)

                for ref in references:
                    # 清理路径
                    ref = ref.strip()
                    if ref:
                        self.referenced_images.add(ref)
                        relative_file = file_path.relative_to(self.project_root)
                        self.reference_details[ref].append(str(relative_file))

                scanned_files += 1

        print(f"✅ 扫描了 {scanned_files} 个小程序文件")

    def scan_root_files(self):
        """扫描项目根目录的相关文件"""
        file_extensions = {'.wxml', '.wxss', '.js', '.json'}

        for file_path in self.project_root.glob('*'):
            if file_path.is_file() and file_path.suffix.lower() in file_extensions:
                references = self.find_image_references_in_file(file_path)

                for ref in references:
                    ref = ref.strip()
                    if ref:
                        self.referenced_images.add(ref)
                        self.reference_details[ref].append(file_path.name)

        print(f"✅ 扫描了项目根目录文件")

    def analyze(self):
        """分析未使用的图片"""
        self.scan_all_images()
        self.scan_miniprogram_files()
        self.scan_root_files()

        # 找出未使用的图片
        unused_images = self.all_images - self.referenced_images

        # 找出被引用但文件不存在的图片
        missing_images = self.referenced_images - self.all_images

        return {
            'total_images': len(self.all_images),
            'referenced_images': len(self.referenced_images),
            'unused_images': sorted(list(unused_images)),
            'missing_images': sorted(list(missing_images)),
            'reference_details': dict(self.reference_details)
        }

    def generate_report(self, output_file='image_usage_report.json'):
        """生成分析报告"""
        result = self.analyze()

        # 添加统计信息
        result['statistics'] = {
            'unused_percentage': len(result['unused_images']) / result['total_images'] * 100 if result['total_images'] > 0 else 0,
            'missing_count': len(result['missing_images'])
        }

        # 保存到文件
        output_path = self.project_root / output_file
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        print(f"\n{'='*60}")
        print("📊 图片使用情况分析报告")
        print(f"{'='*60}")
        print(f"总图片数量: {result['total_images']}")
        print(f"被引用图片: {result['referenced_images']}")
        print(f"未使用图片: {len(result['unused_images'])} ({result['statistics']['unused_percentage']:.1f}%)")
        print(f"缺失图片: {len(result['missing_images'])}")
        print(f"\n✅ 详细报告已保存到: {output_path}")

        # 打印前10个未使用的图片
        if result['unused_images']:
            print(f"\n⚠️  未使用的图片示例（前10个）:")
            for img in result['unused_images'][:10]:
                img_path = self.images_dir / img
                size = self.get_file_size(img_path)
                print(f"  - {img} ({size})")

        # 打印缺失的图片
        if result['missing_images']:
            print(f"\n❌ 被引用但文件不存在的图片:")
            for img in result['missing_images'][:10]:
                print(f"  - {img}")

        return result

    def get_file_size(self, file_path):
        """获取文件大小（人类可读格式）"""
        try:
            size = file_path.stat().st_size
            for unit in ['B', 'KB', 'MB']:
                if size < 1024.0:
                    return f"{size:.1f}{unit}"
                size /= 1024.0
            return f"{size:.1f}GB"
        except:
            return "未知大小"

    def get_large_images(self, size_threshold_kb=100):
        """获取大尺寸图片列表"""
        large_images = []
        size_threshold = size_threshold_kb * 1024

        for img in self.all_images:
            img_path = self.images_dir / img
            try:
                size = img_path.stat().st_size
                if size > size_threshold:
                    large_images.append({
                        'path': img,
                        'size': self.get_file_size(img_path),
                        'size_bytes': size
                    })
            except:
                pass

        # 按大小排序
        large_images.sort(key=lambda x: x['size_bytes'], reverse=True)
        return large_images


def main():
    # 获取项目根目录
    project_root = Path(__file__).parent.parent

    print("🔍 开始分析图片使用情况...")
    print(f"项目根目录: {project_root}\n")

    # 创建分析器
    analyzer = ImageUsageAnalyzer(project_root)

    # 生成报告
    result = analyzer.generate_report()

    # 分析大图片
    print(f"\n{'='*60}")
    print("📦 大尺寸图片分析（>100KB）")
    print(f"{'='*60}")

    large_images = analyzer.get_large_images(size_threshold_kb=100)
    if large_images:
        print(f"找到 {len(large_images)} 个大尺寸图片:\n")
        for img in large_images[:20]:  # 只显示前20个
            status = "❌ 未使用" if img['path'] in result['unused_images'] else "✅ 使用中"
            print(f"  {status} - {img['path']} ({img['size']})")
    else:
        print("✅ 没有找到超过100KB的图片")

    # 保存大图片列表
    large_images_path = project_root / 'large_images.json'
    with open(large_images_path, 'w', encoding='utf-8') as f:
        json.dump(large_images, f, ensure_ascii=False, indent=2)
    print(f"\n✅ 大图片列表已保存到: {large_images_path}")


if __name__ == '__main__':
    main()