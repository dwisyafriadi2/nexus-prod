#!/bin/bash

# Function to print the banner
print_banner() {
  echo """
    ____                       
   / __ \____ __________ ______
  / / / / __ \`/ ___/ __ \`/ ___/
 / /_/ / /_/ (__  ) /_/ / /    
/_____/_\\__,_/____/\\__,_/_/     

    ____                       __
   / __ \___  ____ ___  __  __/ /_  ______  ____ _
  / /_/ / _ \\/ __ \`__ \\/ / / / / / / / __ \\/ __ \`/
 / ____/  __/ / / / / / /_/ / / /_/ / / / / /_/ / 
/_/    \\___/_/ /_/ /_/\\__,_/_/\\__,_/_/ /_/\\__, /  
                                         /____/    

====================================================
     Automation         : Auto Install Nexus Node
     Telegram Channel   : @dasarpemulung
     Telegram Group     : @parapemulung
====================================================
"""
}

# Call the print_banner function
print_banner

# Determine the appropriate home directory based on user
if [ "$EUID" -eq 0 ]; then
    USER_HOME="/root"
else
    USER_HOME="/home/$(whoami)"
fi

echo ""
echo "Updating system packages list..."
sudo apt update -y
echo "System packages list updated."

# Check if build-essential, pkg-config, libssl-dev, and git-all are installed
echo ""
echo "Checking if dependencies are already installed..."

dependencies=("build-essential" "pkg-config" "libssl-dev" "git-all")

for dep in "${dependencies[@]}"; do
    if dpkg -l | grep -q "$dep"; then
        echo "$dep is already installed."
    else
        echo "Installing $dep..."
        sudo apt install -y "$dep"
    fi
done

echo "Dependencies installed/checked."

# Check if Rust is already installed
echo ""
if command -v rustc &> /dev/null; then
    echo "Rust is already installed. Skipping installation."
else
    echo "Installing Rust..."
    curl https://sh.rustup.rs -sSf | sh
    echo "Rust installation completed."
fi

export PATH="$HOME/.cargo/bin:$PATH"
source $HOME/.cargo/env

echo ""
echo "Updating Rust and checking version..."
rustup update
rustc --version
echo "Rust updated successfully."

# Check if Protocol Buffers compiler (protoc) is installed
echo ""
if command -v protoc &> /dev/null; then
    echo "protoc (Protocol Buffers compiler) is already installed."
else
    echo "Installing protoc (Protocol Buffers compiler)..."
    sudo apt install -y protobuf-compiler
    echo "protoc installation completed."
fi

echo ""
echo "Downloading Nexus..."
curl https://cli.nexus.xyz/install.sh | sh
echo "Nexus installation completed."

echo ""
echo "Displaying Nexus prover-id..."
if [ -f "$HOME/.nexus/prover-id" ]; then
    cat $HOME/.nexus/prover-id; echo ""
else
    echo "Prover ID file not found."
fi

echo ""
echo "Managing Nexus service..."
if systemctl list-units --full --all | grep -Fq 'nexus.service'; then
    echo "Nexus service found. Restarting..."
    sudo systemctl stop nexus.service
    sudo systemctl daemon-reload
    sudo systemctl enable nexus.service
    sudo systemctl start nexus.service
    sudo systemctl restart nexus.service
    echo "Nexus service restarted successfully."
else
    echo "Nexus service not found. Please ensure the service is set up correctly."
fi
