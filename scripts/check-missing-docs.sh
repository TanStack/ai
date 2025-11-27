#!/bin/bash

# Script to check for missing API references and examples in docs/config.json
# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔍 Checking for missing API references and examples in config.json${NC}"
echo "=================================================================="

# Function to extract hook names from TypeScript files
extract_hooks_from_package() {
    local package_path="$1"
    local prefix="$2"
    
    if [ ! -d "$package_path" ]; then
        return
    fi
    
    # Find all TypeScript files that start with the prefix and extract hook names
    find "$package_path" -name "${prefix}*.ts" -type f | while read -r file; do
        basename "$file" .ts
    done | sort
}

# Function to extract examples from examples directory
extract_examples_from_framework() {
    local framework="$1"
    local examples_path="examples/$framework"
    
    if [ ! -d "$examples_path" ]; then
        return
    fi
    
    # List all directories in examples/framework
    find "$examples_path" -maxdepth 1 -type d | while read -r dir; do
        if [ "$dir" != "$examples_path" ]; then
            basename "$dir"
        fi
    done | sort
}

# Function to extract API references from config.json
extract_api_refs_from_config() {
    local framework="$1"
    local section="$2"
    
    # Extract API references for a specific framework and section
    jq -r "
        .sections[] | 
        select(.label == \"$section\") | 
        .frameworks[]? | 
        select(.label == \"$framework\") | 
        .children[]? | 
        .label
    " docs/config.json 2>/dev/null | sort
}

# Function to extract examples from config.json
extract_examples_from_config() {
    local framework="$1"
    local section="$2"
    
    # Extract examples for a specific framework and section
    jq -r "
        .sections[] | 
        select(.label == \"$section\") | 
        .frameworks[]? | 
        select(.label == \"$framework\") | 
        .children[]? | 
        .label
    " docs/config.json 2>/dev/null | sort
}

# Function to find items in first list that are not in second list
find_missing() {
    local actual_file="$1"
    local expected_file="$2"
    
    # Use comm to find items in actual that are not in expected
    comm -23 <(sort "$actual_file") <(sort "$expected_file") 2>/dev/null
}

# Function to check framework
check_framework() {
    local framework="$1"
    local hook_prefix="$2"
    
    echo -e "\n${YELLOW}📋 Checking $framework framework${NC}"
    echo "----------------------------------------"
    
    # Get actual hooks from packages
    local package_path="packages/$framework-ai/src"
    
    # Create temporary files
    local temp_dir=$(mktemp -d)
    local actual_hooks_file="$temp_dir/actual_hooks"
    local actual_examples_file="$temp_dir/actual_examples"
    local config_apis_file="$temp_dir/config_apis"
    local config_examples_file="$temp_dir/config_examples"
    
    # Collect all hooks
    {
        extract_hooks_from_package "$package_path" "$hook_prefix"
    } | sort -u > "$actual_hooks_file"
    
    # Get actual examples
    extract_examples_from_framework "$framework" > "$actual_examples_file"
    
    # Check API references for each major section
    local api_sections=(
        "Debouncer API Reference"
        "Throttler API Reference" 
        "Rate Limiter API Reference"
        "Queue API Reference"
        "Batcher API Reference"
    )
    
    {
        for section in "${api_sections[@]}"; do
            extract_api_refs_from_config "$framework" "$section"
        done
    } | sort -u > "$config_apis_file"
    
    # Check examples for each major section
    local example_sections=(
        "Debouncer Examples"
        "Throttler Examples"
        "Rate Limiter Examples"
        "Queue Examples"
        "Batcher Examples"
    )
    
    {
        for section in "${example_sections[@]}"; do
            extract_examples_from_config "$framework" "$section"
        done
    } | sort -u > "$config_examples_file"
    
    # Count items
    local actual_hooks_count=$(wc -l < "$actual_hooks_file")
    local config_apis_count=$(wc -l < "$config_apis_file")
    local actual_examples_count=$(wc -l < "$actual_examples_file")
    local config_examples_count=$(wc -l < "$config_examples_file")
    
    echo "📊 Found $actual_hooks_count hooks, $config_apis_count API refs in config"
    echo "📊 Found $actual_examples_count examples, $config_examples_count example refs in config"
    
    # Find missing API references
    local missing_apis_file="$temp_dir/missing_apis"
    find_missing "$actual_hooks_file" "$config_apis_file" > "$missing_apis_file"
    
    # Find missing examples
    local missing_examples_file="$temp_dir/missing_examples"
    find_missing "$actual_examples_file" "$config_examples_file" > "$missing_examples_file"
    
    # Report results
    if [ -s "$missing_apis_file" ]; then
        echo -e "\n${RED}❌ Missing API References:${NC}"
        cat "$missing_apis_file"
    else
        echo -e "\n${GREEN}✅ All API references are documented${NC}"
    fi
    
    if [ -s "$missing_examples_file" ]; then
        echo -e "\n${RED}❌ Missing Examples:${NC}"
        cat "$missing_examples_file"
    else
        echo -e "\n${GREEN}✅ All examples are documented${NC}"
    fi
    
    # Report extra items in config (might be outdated)
    local extra_apis_file="$temp_dir/extra_apis"
    find_missing "$config_apis_file" "$actual_hooks_file" > "$extra_apis_file"
    
    local extra_examples_file="$temp_dir/extra_examples"
    find_missing "$config_examples_file" "$actual_examples_file" > "$extra_examples_file"
    
    if [ -s "$extra_apis_file" ]; then
        echo -e "\n${YELLOW}⚠️ Extra API References in config (may be outdated):${NC}"
        cat "$extra_apis_file"
    fi
    
    if [ -s "$extra_examples_file" ]; then
        echo -e "\n${YELLOW}⚠️ Extra Examples in config (may be outdated):${NC}"
        cat "$extra_examples_file"
    fi
    
    # Cleanup
    rm -rf "$temp_dir"
}

# Check if jq is available
if ! command -v jq &> /dev/null; then
    echo -e "${RED}❌ jq is required but not installed. Please install jq to run this script.${NC}"
    exit 1
fi

# Check if config.json exists
if [ ! -f "docs/config.json" ]; then
    echo -e "${RED}❌ docs/config.json not found. Please run this script from the project root.${NC}"
    exit 1
fi

# Check React framework
check_framework "react" "use"

# Check Solid framework
check_framework "solid" "create"

echo -e "\n${GREEN}🎉 Documentation check complete!${NC}" 