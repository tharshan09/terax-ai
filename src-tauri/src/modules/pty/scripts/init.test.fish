set -gx TERAX_TERMINAL 1
set -l script_dir (dirname (status filename))

function fish_prompt
    printf base
end

source "$script_dir/init.fish"

# Conda preserves the prompt installed from conf.d before wrapping it.
functions -c fish_prompt __fish_prompt_orig
function fish_prompt
    printf conda
    __fish_prompt_orig
end

__terax_install_prompt

set -l rendered (fish_prompt)
test (string match -ra conda -- "$rendered" | count) -eq 1; or exit 1
test (string match -ra base -- "$rendered" | count) -eq 1; or exit 1
test (string match -ra '133;D;' -- "$rendered" | count) -eq 1; or exit 1
test (string match -ra '133;A' -- "$rendered" | count) -eq 1; or exit 1
test (string match -ra '133;B' -- "$rendered" | count) -eq 1; or exit 1
test (string match -ra '7;file://' -- "$rendered" | count) -eq 1; or exit 1

# Replacements that preserve Conda's helper but do not delegate to it still
# need the post-config rewrap.
functions -e __terax_user_prompt fish_prompt
function fish_prompt
    printf replacement
end
__terax_install_prompt
set rendered (fish_prompt)
test (string match -ra replacement -- "$rendered" | count) -eq 1; or exit 1
test (string match -ra '133;D;' -- "$rendered" | count) -eq 1; or exit 1
test (string match -ra '133;A' -- "$rendered" | count) -eq 1; or exit 1
test (string match -ra '133;B' -- "$rendered" | count) -eq 1; or exit 1
test (string match -ra '7;file://' -- "$rendered" | count) -eq 1; or exit 1

# virtualenv and venv wrap the prompt the same way Conda does, but name their
# copy `_old_fish_prompt`. `functions -n` hides leading-underscore names, so a
# guard that walked the function list missed this and re-wrapped: the copy of
# our prompt then called the captured wrapper straight back, and fish rendered
# until its call-stack limit tripped.
functions -e __terax_user_prompt __fish_prompt_orig fish_prompt
function fish_prompt
    printf base
end
__terax_install_prompt
functions -c fish_prompt _old_fish_prompt
function fish_prompt
    printf venv
    _old_fish_prompt
end
__terax_install_prompt
set rendered (fish_prompt)
test (string match -ra venv -- "$rendered" | count) -eq 1; or exit 1
test (string match -ra base -- "$rendered" | count) -eq 1; or exit 1
test (string match -ra '133;D;' -- "$rendered" | count) -eq 1; or exit 1
test (string match -ra '133;A' -- "$rendered" | count) -eq 1; or exit 1
test (string match -ra '133;B' -- "$rendered" | count) -eq 1; or exit 1
test (string match -ra '7;file://' -- "$rendered" | count) -eq 1; or exit 1

# A directory whose name starts with a dash used to be read as an option by
# `string join`, so every prompt in it reported an error instead of the cwd.
set -l dash_dir (mktemp -d)/-dash
mkdir -p $dash_dir
pushd $dash_dir
set rendered (fish_prompt 2>&1)
popd
rm -rf (dirname $dash_dir)
test (string match -ra '7;file://' -- "$rendered" | count) -eq 1; or exit 1
test (string match -ra 'unknown option' -- "$rendered" | count) -eq 0; or exit 1
