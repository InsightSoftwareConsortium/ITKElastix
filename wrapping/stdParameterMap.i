%include <std_string.i>
%include <std_vector.i>
%include <std_map.i>

%template(mapstringvectorstring)   std::map< std::string, std::vector< std::string > >;
